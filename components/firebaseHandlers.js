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

// Returns the current number of files in the current collection.
async function getFileCountInDirectory(uid, collectionName) {
  const [files] = await bucket.getFiles({
    prefix: `images/${uid}/sheetCollections/${collectionName}/`,
  });

  return files.length;
}

// returns a dateTime string representing the current time. <YYYYMMDDHHmmss>
function getCurrentDateTime() {
  const now = new Date();
  const dateTime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(
    2,
    "0"
  )}${String(now.getMinutes()).padStart(2, "0")}${String(
    now.getSeconds()
  ).padStart(2, "0")}`;
  return dateTime;
}

// Sends the newly created PDF file to the user's firebase storage location and then deletes the local file.
async function sendFileToFirebaseAndDelete(
  uid,
  filePath,
  contentType,
  lyFile,
  xmlFile,
  collectionName
) {
  try {
    // Get the count of files in the directory
    const count = (await getFileCountInDirectory(uid, collectionName)) + 1;

    // Generate the current dateTime string
    const dateTime = getCurrentDateTime();

    const outputPath = `images/${uid}/sheetCollections/${collectionName}/${count}-${uid}-${dateTime}`;

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

    return outputPath;
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

  // Delete the file from Firebase Storage
  await file
    .delete()
    .then(() => {
      console.log("File has been deleted from Firebase Storage.");
    })
    .catch((error) => {
      console.error("Error deleting file from Firebase Storage:", error);
    });

  return tempFilePath; // return the path where the file was downloaded
}

module.exports = {
  sendFileToFirebaseAndDelete,
  getFileFromInputDir,
};
