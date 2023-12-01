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
  deletePDFOutput,
} = require("./components/fileUtilities");
const { runAudiverisBatch, runLilyPond } = require("./components/executables");

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

app.use(express.json());

async function sendWebsocketServerProgressMessage(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function validateUID(req, res) {
  const uid = req.body.uid;
  if (!uid) {
    res.status(400).json({ error: "No UID provided" });
    throw new Error("No UID provided");
  }
  return uid;
}

async function validateInputFile(uid) {
  let filePath = await getFileFromInputDir(uid);

  if (!filePath) {
    return res.status(404).json({ error: "No file found" });
  }

  return filePath;
}

function DeleteAudiverisWorkerFiles(inputFilePath, outputDir) {
  let fileName = path.basename(inputFilePath, path.extname(inputFilePath)); // extracting the filename from the full path

  let omrFile = `${outputDir}/${fileName}.omr`;
  let logFiles = fs
    .readdirSync(outputDir)
    .filter((file) => file.startsWith(`${fileName}-`) && file.endsWith(".log"));

  console.log("OMR :" + omrFile + "LOG: " + logFiles);

  const filesToDelete = [
    omrFile,
    ...logFiles.map((logFile) => `${outputDir}/${logFile}`),
  ];

  if (!inputFilePath.includes(".pdf")) {
    filesToDelete.push(inputFilePath);
  }

  deleteFiles(filesToDelete);
}

function deleteClientOutputFolder(uid) {
  const folderPath = path.join(__dirname, `output_files\\${uid}`);

  // Delete the user's uid output folder
  fs.rmdir(folderPath, (error) => {
    if (error) {
      console.error(`Error deleting folder ${folderPath}:`, error);
    } else {
      console.log(`Folder ${folderPath} has been deleted.`);
    }
  });
}

async function processLilyPond(notes, uid, timeData, collectionName) {
  const lilypond_code = notes_to_lilypond(notes, timeData, collectionName);
  const lilyFileName = `${uid}.ly`;

  fs.writeFileSync(lilyFileName, lilypond_code);
  await runLilyPond("pdf_output", lilyFileName);

  const lilypondOutputFileLocation = path.join(__dirname, `${uid}.pdf`);

  return lilypondOutputFileLocation;
}

async function fetchNoteCoordsAndClean(uid) {
  let coordinateData = [];

  const coordinateFilePath = `./output_files/${uid}/${uid}.xml`; // Update this path as necessary
  await parseXMLForCoordinates(coordinateFilePath)
    .then((parsedData) => {
      console.log(JSON.stringify(parsedData, null, 2));
      coordinateData = parsedData;
    })
    .catch((error) => {
      console.log("Error:", error);
    });

  //TODO: delete the final product files

  return coordinateData;
}

// File upload endpoint
app.post("/upload", async (req, res) => {
  sendWebsocketServerProgressMessage("Scanning Image");

  const uid = validateUID(req, res);

  console.log("Received UID:", uid);

  const inputFilePath = await validateInputFile(uid);

  console.log("File path:", inputFilePath);

  try {
    const outputDir = "output_files"; // Update this with your desired output directory
    await runAudiverisBatch(inputFilePath, outputDir);

    sendWebsocketServerProgressMessage("Gathering note data");

    DeleteAudiverisWorkerFiles(inputFilePath, outputDir);

    extractAndDeleteMxlFiles(outputDir);

    const folders = fs.readdirSync(outputDir);
    const directories = folders.filter((folder) =>
      fs.statSync(path.join(outputDir, folder)).isDirectory()
    );

    directories.sort((a, b) => {
      const lastNumberA = parseInt(a.match(/\d+$/)[0], 10);
      const lastNumberB = parseInt(b.match(/\d+$/)[0], 10);
      return lastNumberA - lastNumberB;
    });

    let totalNotes = [];
    let timeData;

    for (const folder of directories) {
      let uidWithoutExtension = path.basename(folder, path.extname(folder));

      // Check if the folder name includes '.mvt'
      if (folder.includes(".mvt")) {
        // Extract the count from the folder name
        const count = folder.match(/\.mvt(\d+)/);
        const suffix = count ? count[1] : 1; // If count is not present, use 1

        uidWithoutExtension = `${uidWithoutExtension}.mvt${suffix}`;
      }

      console.log("W/O EXTENSION NAME: " + uidWithoutExtension);
      const musicXMLFilePath = path.join(
        outputDir,
        folder,
        `${uidWithoutExtension}.xml`
      );
      const { notes, time } = await parseMusicXML(musicXMLFilePath);
      totalNotes.push(notes);
      timeData = time;
      console.log("Pushing now...");
    }
    console.log("PRINTING HERE...");
    console.log(JSON.stringify(totalNotes));

    console.log("PROCESSING...");

    const pdfFilePath = await processLilyPond(
      totalNotes,
      uid,
      timeData,
      req.body.collectionName
    );

    const lyFilePath = path.join(__dirname, `${uid}.ly`);
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
      xmlFilePath,
      req.body.collectionName,
      req.body.imageNumber
    );

    if (!result) {
      return res
        .status(500)
        .json({ error: "Failed to upload PNG to Firebase" });
    }

    deleteClientOutputFolder(uid);

    // THIS IS THE FILE UPLOAD LOCATION
    const firebasePath = result;

    await runAudiverisBatch(pdfFilePath, outputDir);

    await sendWebsocketServerProgressMessage("Loading response data");

    DeleteAudiverisWorkerFiles(pdfFilePath, outputDir);

    extractAndDeleteMxlFiles(outputDir);
    const coordinateData = await fetchNoteCoordsAndClean(uid);

    const notes = totalNotes.flat();

    deletePDFOutput(uid);

    try {
      // Delete the file
      fs.unlinkSync(xmlFilePath);
      console.log(`File ${xmlFilePath} has been deleted.`);
      deleteClientOutputFolder(uid); // Proceed with the next step
    } catch (error) {
      console.error(`Error deleting file ${xmlFilePath}:`, error);
    }

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
