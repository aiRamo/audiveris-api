const express = require('express');
const multer = require('multer');
const cors = require('cors');
const app = express();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Multer configuration for handling file uploads
const upload = multer({ dest: 'uploads/' });



// Function to run Audiveris batch command
function runAudiverisBatch(inputFile, outputDir) {
  const audiverisPath = path.resolve(__dirname, 'Audiveris/Audiveris/bin/Audiveris');
  const command = `"${audiverisPath}" -export -output ${outputDir} -batch ${inputFile}`;
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(error);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

function deleteFiles(files) {
  files.forEach((file) => {
    fs.unlink(file, (err) => {
      if (err) {
        console.error(`Error deleting file ${file}:`, err);
      } else {
        console.log(`File ${file} deleted successfully`);
      }
    });
  });
}

function extractAndDeleteMxlFiles(outputDir) {
  const files = fs.readdirSync(outputDir);
  files.forEach((file) => {
    if (path.extname(file) === '.mxl') {
      const mxlPath = path.join(outputDir, file);
      const zip = new AdmZip(mxlPath);
      const extractedDir = path.join(outputDir, path.basename(file, '.mxl'));
      zip.extractAllTo(extractedDir, true);
      fs.unlinkSync(mxlPath);

       // Delete the META-INF folder if it exists
       const metaInfPath = path.join(extractedDir, 'META-INF');
       if (fs.existsSync(metaInfPath)) {
         fs.rmdirSync(metaInfPath, { recursive: true });
       }
    }
  });
}

// Function to parse MusicXML and extract notes
function parseMusicXML(musicXMLFilePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(musicXMLFilePath, 'utf-8', (error, data) => {
      if (error) {
        reject(error);
      } else {
        xml2js.parseString(data, (parseError, result) => {
          if (parseError) {
            reject(parseError);
          } else {
            const parts = result['score-partwise']['part'];

            // Array to hold all measures from all parts
            const allNotesWithMeasureData = [];

            // Loop through all parts
            parts.forEach((part) => {
              const measures = part['measure'];

              // Loop through all measures of the current part
              measures.forEach((measure) => {
                const measureData = {
                  partId: part.$.id, // Part ID
                  number: measure.$.number, // Measure number
                  attributes: measure['attributes'], // Measure attributes
                  notes: [], // Array to hold notes and rests in the measure
                };

                const notes = measure['note'];
                if (Array.isArray(notes)) {
                  notes.forEach((note) => {
                    if (note.rest) {
                      // Handle rests (no pitch, type, beam, or chord for rests)
                      measureData.notes.push({ rest: true, duration: note.duration });
                    } else {
                      const { pitch, type, beam, staff, chord, dot, accidental } = note; // Extract desired note attributes
                      measureData.notes.push({ pitch, type, beam, staff, chord, dot, accidental });
                    }
                  });
                } else {
                  // For a single note or rest
                  if (notes.rest) {
                    measureData.notes.push({ rest: true, duration: notes.duration });
                  } else {
                    const { pitch, type, beam, staff, chord, dot } = notes; // Extract desired note attributes
                    measureData.notes.push({ pitch, type, beam, staff, chord, dot, accidental });
                  }
                }

                allNotesWithMeasureData.push(measureData);
              });
            });

            resolve(allNotesWithMeasureData);
          }
        });
      }
    });
  });
}

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log('Received file:', req.file);

  console.log(`File detected... ${req.file.path}`);
  console.log("MULTER: " + JSON.stringify(upload));

  try {
    const inputFile = req.file.path;
    const outputDir = 'output_files'; // Update this with your desired output directory
    await runAudiverisBatch(inputFile, outputDir);

    // Assuming the output files are saved with specific filenames like 'output1.xml', 'output2.xml', etc.
    const outputFiles = [
      `${outputDir}/${req.file.filename}`,
      // Add other output files as needed
    ];

    

    const omrFile = `${outputDir}/${req.file.filename}.omr`;
    const logFiles = fs.readdirSync(outputDir).filter((file) => file.startsWith(`${req.file.filename}-`) && file.endsWith('.log'));
    deleteFiles([omrFile, ...logFiles.map((logFile) => `${outputDir}/${logFile}`)]);
    deleteFiles([inputFile]);
    extractAndDeleteMxlFiles(outputDir);

    const musicXMLFilePath = `${outputDir}/${req.file.filename}/${req.file.filename}.xml`;
    const notes = await parseMusicXML(musicXMLFilePath);

    res.json({ outputFiles, notes });
  } catch (error) {
    console.error('Error running Audiveris:', error);
    res.status(500).json({ error: 'An error occurred during Audiveris processing' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});