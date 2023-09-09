const { exec } = require("child_process");
const path = require("path");

//lilypond
async function runLilyPond(outputDir, filename) {
  const lilyPondPath = path.join(
    __dirname,
    "..",
    "lilypond-2.24.2",
    "bin",
    "lilypond"
  );
  const command = `${lilyPondPath} -fpdf ${filename}`; //Change this line if lilypond is not firing off correctly

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

// Function to run Audiveris batch command
function runAudiverisBatch(inputFile, outputDir) {
  const audiverisPath = path.join(
    __dirname,
    "..",
    "Audiveris",
    "Audiveris",
    "bin",
    "Audiveris"
  );
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

module.exports = {
  runLilyPond,
  runAudiverisBatch,
};
