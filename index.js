const express = require('express');
const multer = require('multer');
const cors = require('cors');
const app = express();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');
const e = require('express');

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
                      measureData.notes.push({ rest: true, duration: note.duration});
                    } else {
                      const { pitch, type, beam, staff, chord, dot, accidental, voice } = note; // Extract desired note attributes
                      measureData.notes.push({ pitch, type, beam, staff, chord, dot, accidental, voice });
                    }
                  });
                } else {
                  // For a single note or rest
                  if (notes.rest) {
                    measureData.notes.push({ rest: true, duration: notes.duration });
                  } else {
                    const { pitch, type, beam, staff, chord, dot, voice } = notes; // Extract desired note attributes
                    measureData.notes.push({ pitch, type, beam, staff, chord, dot, accidental, voice });
                  }
                }
                console.log(JSON.stringify(measureData));
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

// ------- TRANSLATOR

// removeCharacter() is used to surgically remove characters in a string.
// We used this to process chord detection, since we need to work backwards and correct the chord format for lilypond.
// This is due to the fact that the muxicXML file does not categorize the first note in a chord as such.

function removeCharacter(str, char) {
  const regex = new RegExp(char, "g");
  return str.replace(regex, "");
}

// noteToLilypond() is used to process each note in the musicXML.
// This will create and return a string variable that will include the note's step, octave, chord info, dot info, and type info in the correct format.

function noteToLilypond(note) {
  let lilypondNote = '';

  if (note.rest) {
    lilypondNote += 'r'; // Rest
  } else {
    // Handle pitch
    const { pitch } = note;
    const step = pitch[0].step[0];
    const octave = pitch[0].octave[0];
    let octaveNum;

    //switch used to specify the octave to lilypond using the octave child in the note.
    switch (parseInt(octave)) {
      case 1:
        octaveNum = ',,';
        break;
      case 2:
        octaveNum = ',';
        break;
      case 3:
        octaveNum = '';
        break;
      case 4:
        octaveNum = '\'';
        break;
      case 5:
        octaveNum = '\'\''
        break;
      case 6:
        octaveNum = '\'\'\''
        break;
      case 7:
        octaveNum = '\'\'\'\''
        break;
      default:
        console.log('octave = ' + octave);
        octaveNum = ''
        break;
    }
    lilypondNote += step.toLowerCase() + octaveNum;
  }

  // Handle duration
  const { type } = note;
  let numType;
  switch(type[0]) {
    case "eighth":
      numType = '8';
      break;
    case "quarter":
      numType = '4';
      break;
    case "half":
      numType = '2';
      break;
    default:
      numType = 'err';
  }
  lilypondNote += numType;

  // Handle Dot

  const { dot } = note;
  if (dot) {
    lilypondNote += '.';
  }

  // Handle Chord
  // This will initially write the chord incorrectly if it has more than 2 notes. It will write the middle note as the end note of the chord as well.
  // We handle this in notes_to_lilypond() by reversing an array of the notes and detecting and processing when we enter and exit a chord.
  const {chord} = note;
  if (chord) {
    
    if (dot) {
      lilypondNote = lilypondNote.slice(0, -2);
      lilypondNote += `>${numType}.`;
    }
    else {
      lilypondNote = lilypondNote.slice(0, -1);
      lilypondNote += `>${numType}`;
    }
    
  }

  return lilypondNote;
}

// notes_to_lilypond() isolates the notes by their respective measure, then staff, then voice.
// These notes, grouped by voice, staff, & measure, will then be rewritten into lilypond format.

function notes_to_lilypond(notes) {
  let staff_code = []; // staff_code will be an array of strings, with each array member being the code for a given staff. These will be compiled together in lilypond_code.
  let lilypond_code = "\n\\version \"2.24.1\"\n\n";
  lilypond_code += "\\paper {\n";
  lilypond_code += "  ragged-right = ##f\n";
  lilypond_code += "}\n\n";
  lilypond_code += "\\score {\n";
  lilypond_code += "  <<\n";

  // Find all unique measure numbers
  const measureNumbers = new Set(notes.map((measure) => measure.number));

  console.log('MEASURE NUMBERS: ' + Array.from(measureNumbers).join(', '));

  // Generate LilyPond code for each measure
  measureNumbers.forEach((measureNumber) => {
    
    const measureNotes = notes.find((measure) => measure.number === measureNumber).notes;
    console.log('MEASURE NOTES: ' + JSON.stringify(measureNotes));

    // Get exact # of staffs per measure... Ex: 2 staffs detected = [1, 2]
    const staffNumbers = measureNotes.map((note) => parseInt(note.staff));
    const uniqueStaffNumArray = [];
    for (let i = 0; i < staffNumbers.length; i++) {
      if (i === 0 || staffNumbers[i] !== staffNumbers[i - 1]) {
        uniqueStaffNumArray.push(staffNumbers[i]);
      }
    }
    console.log('STAFF NUMBERS: ' + Array.from(uniqueStaffNumArray).join(', '));

    // For each staff number found..
    // This is where the staff_code array is built, controlled by index.
    uniqueStaffNumArray.forEach((staffNumber, index) => {

      // Pulls the notes in the current measure that belong to the current staff number
      const staffNotes = measureNotes.filter((note) => parseInt(note.staff) === staffNumber);
      console.log('STAFF NOTES: ' + JSON.stringify(staffNotes));

      // initializes the TOP of the staff:
      staff_code[index] = (staff_code[index] || '');

      if (staff_code[index] == '') {
        staff_code[index] += `  \\new Staff {\n`;

        let clef;
        // Assuming staff 1 = treble, 2 = bass, etc.
        switch (staffNumber) {
          case 1:
            clef = 'treble';
            break;
          case 2:
            clef = 'bass';
            break;
          default:
            console.log('STAFF NUMBER: ' + staffNotes);
            break;
        }
        staff_code[index] += `    \\clef ${clef}\n`;
        staff_code[index] += `    \\time 3/4\n`;

        staff_code[index] += ``;
      }

      // Creates a set of the voice numbers for the current staff:
      const voiceNumbers = staffNotes.map((note) => parseInt(note.voice));
      const uniqueVoiceNumArray = [];
      for (let i = 0; i < voiceNumbers.length; i++) {
        if (i === 0 || voiceNumbers[i] !== voiceNumbers[i - 1]) {
          uniqueVoiceNumArray.push(voiceNumbers[i]);
        }
      }
      console.log('VOICE NUMBERS: ' + Array.from(uniqueVoiceNumArray).join(', '));

      // For each voice on the staff, add the notes in them in order.
      uniqueVoiceNumArray.forEach((voice, vIndex) => {
        vIndex += 1;
        let textVIndex = '';

        // Pulls the notes in the current staff that belong to the current voice number
        const voiceNotes = staffNotes.filter((note) => parseInt(note.voice) === voice);
        console.log('VOICE NOTES: ' + JSON.stringify(voiceNotes));

        switch (vIndex) {
          case 1:
            if (staffNumber == 1){
              textVIndex = "One";
            }
            else if (staffNumber == 2){
              textVIndex = "Four";
            }
            break;
          case 2:
            if (staffNumber == 1){
              textVIndex = "Two";
            }
            else if (staffNumber == 2){
              textVIndex = "Three";
            }
            break;
          default:
            textVIndex = "One";
            break;
        }

        if (vIndex == 1) {
          staff_code[index] += `    \\new Voice = \"${staffNumber}${measureNumber}\" {\n`;
          staff_code[index] += `      <<\n`;
          staff_code[index] += `        {\n`;
        } else {
          staff_code[index] += `        \\new Voice {\n`;
        }
        
        staff_code[index] += `          \\voice${textVIndex}\n`;
        staff_code[index] += `          `;


        // lilynotes is used to gather all the notes in the given voice.
        // Then, it reverses itself and checks to see which notes belong to chords if any exist.

        const lilynotes = [];

        voiceNotes.forEach((note) => {
          lilynotes.push(noteToLilypond(note))
        });
        console.log("LILYNOTES: " + Array.from(lilynotes).join(', '));

        lilynotes.reverse();

        console.log("LILYNOTES REVERSED: " + Array.from(lilynotes).join(', '));

        let inChord = false;
        lilynotes.forEach((note, i) => {
          if (note.includes('>') && inChord == false) {
            inChord = true;
          }
          else if (note.includes('>') && inChord == true) {
            lilynotes[i] = removeCharacter(note, '>');
          }
          else if (!(note.includes('>')) && inChord == true) {
            if (note.includes('.')){
              note = note.slice(0, -2);
              lilynotes[i] = '<' + note;
            }
            else {
              note = note.slice(0, -1);
              lilynotes[i] = '<' + note;
            }
            
            inChord = false;
          }
          else {
            ;
          }
        });

        //reverses lilyntoes again to put it back in the correct order
        lilynotes.reverse();

        console.log("LILYNOTES PROCESSED: " + Array.from(lilynotes).join(', '));

        // Adds the now-chord-corrected notes into staff_code in order
        lilynotes.forEach((note) => {
          staff_code[index] += `${note}  `;
        })

        staff_code[index] += `\n        }\n`;

      })

      staff_code[index] += `      >>\n`;
      staff_code[index] += `      \\oneVoice\n`;
      staff_code[index] += `    }|\n\n`;

      console.log(`\nSTAFF CODE #${index}: \n\n` + staff_code[index]);
    })
  });

  //insert the staffs in staff_code into lilypond_code
  staff_code.forEach((staff) => {
    lilypond_code += staff;
    lilypond_code += `  }\n\n`;
  })

  lilypond_code += "  >>\n";
  lilypond_code += "}\n";

  return lilypond_code;
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

    const lilypond_code = notes_to_lilypond(notes);

    console.log(lilypond_code);

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