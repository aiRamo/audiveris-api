const pdf = require("pdf-poppler");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

async function convertPDFToPNG(pdfFilePath, outputDir) {
  const opts = {
    format: "png",
    out_dir: outputDir,
    out_prefix: "output",
    page: null,
  };

  try {
    await pdf.convert(pdfFilePath, opts);
    return `${outputDir}/output-1.png`; // Assuming you are interested in the first page only
  } catch (err) {
    console.error("Error converting PDF to PNG:", err);
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
  convertPDFToPNG,
  deleteFiles,
  extractAndDeleteMxlFiles,
};
