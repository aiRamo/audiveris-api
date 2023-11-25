const pdf = require("pdf-poppler");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

async function convertPDFToPNG(pdfFilePath, outputDir) {
  console.log(
    `Attempting to convert PDF at ${pdfFilePath} to PNG in directory ${outputDir}`
  );

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    console.log(`Directory ${outputDir} doesn't exist. Creating it.`);
    fs.mkdirSync(outputDir);
  }

  const opts = {
    format: "png",
    out_dir: outputDir,
    out_prefix: "output",
    page: null,
  };

  try {
    await pdf.convert(pdfFilePath, opts);
    return `${outputDir}/output-1.png`;
  } catch (err) {
    console.error(`Error converting PDF to PNG: ${err}`);
    return null;
  }
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

function deletePDFOutput(uid) {
  // filePath in the parent directory of the current script
  const filePath = path.join(__dirname, '..', `${uid}.pdf`);

  try {
    fs.unlinkSync(filePath); // Deletes the file
    console.log(`File ${filePath} deleted successfully`);
  } catch (err) {
      console.error(`Error while deleting file: ${err}`);
  }
}
function extractAndDeleteMxlFiles(outputDir) {
  const files = fs.readdirSync(outputDir);
  files.forEach((file) => {
    if (path.extname(file) === ".mxl") {
      const mxlPath = path.join(outputDir, file);
      const zip = new AdmZip(mxlPath);
      const extractedDir = path.join(outputDir, path.basename(file, ".mxl"));
      zip.extractAllTo(extractedDir, true);
      fs.unlinkSync(mxlPath);

      // Delete the META-INF folder if it exists
      const metaInfPath = path.join(extractedDir, "META-INF");
      if (fs.existsSync(metaInfPath)) {
        fs.rmdirSync(metaInfPath, { recursive: true });
      }
    }
  });
}

module.exports = {
  deletePDFOutput,
  convertPDFToPNG,
  deleteFiles,
  extractAndDeleteMxlFiles,
};
