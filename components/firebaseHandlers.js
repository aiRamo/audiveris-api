const fs = require("fs");
const path = require("path");

// Firebase Storage Input File Download ....

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
    path.join(__dirname, "..", "firebase-key.json")
  ),
  storageBucket: "soundsync-sd.appspot.com",
});

// Define a reference to the file in Firebase Storage
const bucket = admin.storage().bucket();

// Sends the newly created PDF file to the user's firebase storage location and then deletes the local file.
async function sendFileToFirebaseAndDelete(
  uid,
  filePath,
  contentType,
  lyFile,
  xmlFile
) {
  try {
    const outputPath = `images/${uid}/outputFile/${path.basename(filePath)}`;

    // Uploads the output file to Firebase Storage
    await bucket.upload(filePath, {
      destination: outputPath,
      metadata: {
        contentType,
      },
    });

    console.log(`File ${filePath} uploaded to ${outputPath}`);

    // Deletes the local output file
    fs.unlinkSync(filePath);
    fs.unlinkSync(lyFile);
    fs.unlinkSync(xmlFile);

    return true;
  } catch (error) {
    console.error("Error uploading file to Firebase:", error);
    return false;
  }
}

// Downloads the input file from Firebase
async function getFileFromInputDir(uid) {
  const directoryPath = `images/${uid}/inputFile/`;

  const [files] = await bucket.getFiles({
    prefix: directoryPath,
  });

  if (files.length === 0) {
    console.log("No files found.");
    return null;
  }

  // Make sure the 'uploads' directory exists in your project directory
  const projectUploadsDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(projectUploadsDir)) {
    fs.mkdirSync(projectUploadsDir);
  }

  const file = files[0];
  const tempFilePath = path.join(projectUploadsDir, path.basename(file.name));

  // Download the file
  await file.download({ destination: tempFilePath });

  console.log("File has been downloaded to", tempFilePath);
  return tempFilePath; // return the path where the file was downloaded
}

module.exports = {
  sendFileToFirebaseAndDelete,
  getFileFromInputDir,
};
