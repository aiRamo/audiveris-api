// Server-side code
const express = require("express");
const cors = require("cors");
const app = express();
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 4000 });

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    console.log(`Received message: ${message}`);
  });
});

const {
  parseXMLForCoordinates,
  parseMusicXML,
} = require("./components/xmlParsers");
const {
  sendFileToFirebaseAndDelete,
  getFileFromInputDir,
} = require("./components/firebaseHandlers");
const { notes_to_lilypond } = require("./components/lilypondTranslator");
const {
  convertPDFToPNG,
  deleteFiles,
  extractAndDeleteMxlFiles,
} = require("./components/fileUtilities");
const { runAudiverisBatch, runLilyPond } = require("./components/executables");

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

app.use(express.json());

// File upload endpoint
app.post("/upload", async (req, res) => {
  // Notify WebSocket clients about second Audiveris batch completion
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send("Scanning image");
    }
  });

  const uid = req.body.uid; // Firebase UID from the client

  if (!uid) {
    return res.status(400).json({ error: "No UID provided" });
  }

  console.log("Received UID:", uid);

  let filePath = await getFileFromInputDir(uid);

  if (!filePath) {
    return res.status(404).json({ error: "No file found" });
  }

  console.log("File path:", filePath);

  try {
    const outputDir = "output_files"; // Update this with your desired output directory
    await runAudiverisBatch(filePath, outputDir);

    // Notify WebSocket clients about first Audiveris batch completion
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send("Gathering note data");
      }
    });

    // Assuming the output files are saved with specific filenames
    let fileName = path.basename(filePath, path.extname(filePath)); // extracting the filename from the full path
    const outputFiles = [`${outputDir}/${fileName}`];

    let omrFile = `${outputDir}/${fileName}.omr`;
    let logFiles = fs
      .readdirSync(outputDir)
      .filter(
        (file) => file.startsWith(`${fileName}-`) && file.endsWith(".log")
      );

    console.log("OMR :" + omrFile + "LOG: " + logFiles);

    deleteFiles([
      omrFile,
      ...logFiles.map((logFile) => `${outputDir}/${logFile}`),
    ]);

    deleteFiles([filePath]); // Delete the downloaded file
    extractAndDeleteMxlFiles(outputDir);

    const uidWithoutExtension = path.basename(filePath, path.extname(filePath)); // Remove the extension from uid
    const musicXMLFilePath = `${outputDir}/${uid}/${uidWithoutExtension}.xml`;

    const notes = await parseMusicXML(musicXMLFilePath);

    const lilypond_code = notes_to_lilypond(notes);

    const lilyFileName = "here.ly";
    fs.writeFileSync(lilyFileName, lilypond_code);
    await runLilyPond("pdf_output", lilyFileName);

    // file paths to be used later on
    const pdfFilePath = path.join(__dirname, "here.pdf");
    const lyFilePath = path.join(__dirname, "here.ly");
    const xmlFilePath = path.join(
      __dirname,
      `output_files\\${uid}\\${uid}.xml`
    );
    const pngFilePath = await convertPDFToPNG(pdfFilePath, "png_output");

    if (pngFilePath === null) {
      return res.status(500).json({ error: "Failed to convert PDF to PNG" });
    }

    const result = await sendFileToFirebaseAndDelete(
      uid,
      pngFilePath,
      "image/png",
      lyFilePath,
      xmlFilePath
    );
    //const resultPDF = await sendFileToFirebaseAndDelete(uid, pdfFilePath, 'application/pdf');

    if (!result) {
      return res
        .status(500)
        .json({ error: "Failed to upload PNG to Firebase" });
    }

    const folderPath = path.join(__dirname, `output_files\\${uid}`);

    // Delete the user's uid output folder
    fs.rmdir(folderPath, (error) => {
      if (error) {
        console.error(`Error deleting folder ${folderPath}:`, error);
      } else {
        console.log(`Folder ${folderPath} has been deleted.`);
      }
    });

    // THIS IS THE FILE UPLOAD LOCATION
    const firebasePath = `images/${uid}/outputFile/output-1.png`; // Replace 'here.pdf' with your actual file name

    await runAudiverisBatch(pdfFilePath, outputDir);

    // Notify WebSocket clients about second Audiveris batch completion
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send("Loading response data");
      }
    });

    fileName = path.basename(pdfFilePath, path.extname(pdfFilePath));

    omrFile = `${outputDir}/${fileName}.omr`;
    logFiles = fs
      .readdirSync(outputDir)
      .filter(
        (file) => file.startsWith(`${fileName}-`) && file.endsWith(".log")
      );

    deleteFiles([
      omrFile,
      ...logFiles.map((logFile) => `${outputDir}/${logFile}`),
    ]);

    extractAndDeleteMxlFiles(outputDir);

    let coordinateData = [];

    filePath = "./output_files/here/here.xml"; // Update this path as necessary
    await parseXMLForCoordinates(filePath)
      .then((parsedData) => {
        console.log(JSON.stringify(parsedData, null, 2));
        coordinateData = parsedData;
      })
      .catch((error) => {
        console.log("Error:", error);
      });

    //console.log(lilypond_code);
    res.json({ firebasePath, notes, coordinateData });
  } catch (error) {
    console.error("Error running Audiveris:", error);
    res
      .status(500)
      .json({ error: "An error occurred during Audiveris processing" });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
