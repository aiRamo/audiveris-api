const fs = require("fs");
const xml2js = require("xml2js");

const parseXMLForCoordinates = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      xml2js.parseString(data, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const parsedData = {
          pageLayout: {},
          parts: [],
        };

        // Extracting page layout details
        const pageLayout =
          result["score-partwise"]["defaults"][0]["page-layout"][0];
        parsedData.pageLayout.leftMargin = parseInt(
          pageLayout["page-margins"][0]["left-margin"][0],
          10
        );
        parsedData.pageLayout.topMargin = parseInt(
          pageLayout["page-margins"][0]["top-margin"][0],
          10
        );
        parsedData.pageLayout.pageHeight = parseInt(
          pageLayout["page-height"][0],
          10
        );
        parsedData.pageLayout.pageWidth = parseInt(
          pageLayout["page-width"][0],
          10
        );

        // Loop through each part
        const parts = result["score-partwise"].part;
        parts.forEach((part, partIndex) => {
          const partData = {
            id: part["$"].id,
            measures: [],
          };

          // Loop through each measure
          part.measure.forEach((measure, measureIndex) => {
            const measureData = {
              width: null,
              leftMargin: null,
              staffDistance: null,
              systemDistance: null,
              topSystemDistance: null,
              notes: [],
            };

            // Extract measure width
            if (measure["$"] && measure["$"].width) {
              measureData.width = parseInt(measure["$"].width, 10);
            }

            // Extract left-margin from system-margins within the measure
            if (measure.print && measure.print[0]["system-layout"]) {
              measureData.leftMargin = parseInt(
                measure.print[0]["system-layout"][0]["system-margins"][0][
                  "left-margin"
                ][0],
                10
              );
            }

            // Extract top-system-distance when we encounter it.
            if (
              measure.print &&
              measure.print[0]["system-layout"] &&
              measure.print[0]["system-layout"][0]["top-system-distance"]
            ) {
              measureData.topSystemDistance = parseInt(
                measure.print[0]["system-layout"][0]["top-system-distance"],
                10
              );
            }

            // Extract staff-distance when we encounter it.
            if (
              measure.print &&
              measure.print[0]["staff-layout"] &&
              measure.print[0]["staff-layout"][0]["staff-distance"]
            ) {
              measureData.staffDistance = parseInt(
                measure.print[0]["staff-layout"][0]["staff-distance"][0],
                10
              );
            }

            // Extract system-distance when we encounter it.
            if (
              measure.print &&
              measure.print[0]["system-layout"] &&
              measure.print[0]["system-layout"][0]["system-distance"]
            ) {
              measureData.systemDistance = parseInt(
                measure.print[0]["system-layout"][0]["system-distance"][0],
                10
              );
            }

            // Loop through each note in the measure
            if (measure.note) {
              measure.note.forEach((note) => {
                const noteData = {};

                // Extract note default-x
                if (note["$"] && note["$"]["default-x"]) {
                  noteData.defaultX = parseInt(note["$"]["default-x"], 10);
                }

                // Extract stem default-y
                if (
                  note.stem &&
                  note.stem[0] &&
                  note.stem[0]["$"] &&
                  note.stem[0]["$"]["default-y"]
                ) {
                  noteData.defaultY = parseInt(
                    note.stem[0]["$"]["default-y"],
                    10
                  );
                }

                measureData.notes.push(noteData);
              });
            }

            partData.measures.push(measureData);
          });

          parsedData.parts.push(partData);
        });

        resolve(parsedData);
      });
    });
  });
};

// Function to parse MusicXML and extract notes
function parseMusicXML(musicXMLFilePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(musicXMLFilePath, "utf-8", (error, data) => {
      if (error) {
        reject(error);
      } else {
        xml2js.parseString(data, (parseError, result) => {
          if (parseError) {
            reject(parseError);
          } else {
            const parts = result["score-partwise"]["part"];

            // Array to hold all measures from all parts
            const allNotesWithMeasureData = [];
            let firstMeasureTimeData = {
              beats: "3",
              beatType: "4",
            };

            // Loop through all parts
            parts.forEach((part) => {
              const measures = part["measure"];

              // Loop through all measures of the current part
              measures.forEach((measure, index) => {
                const measureData = {
                  partId: part.$.id, // Part ID
                  number: measure.$.number, // Measure number
                  attributes: measure["attributes"], // Measure attributes
                  notes: [], // Array to hold notes and rests in the measure
                  lineBreak: measure["print"],
                };

                // Extract the time data (beats and beat-type) from the first measure
                if (
                  index === 0 &&
                  measure.attributes &&
                  measure.attributes[0] &&
                  measure.attributes[0].time
                ) {
                  const timeAttributes = measure.attributes[0].time[0];
                  firstMeasureTimeData = {
                    beats: parseInt(timeAttributes.beats[0], 10),
                    beatType: parseInt(timeAttributes["beat-type"][0], 10),
                  };
                }

                const notes = measure["note"];
                if (Array.isArray(notes)) {
                  notes.forEach((note) => {
                    // Initialize an object to hold the note data
                    let noteData = {};

                    if (note.rest) {
                      const { rest, duration, voice, staff, type } = note;
                      noteData = { rest, duration, voice, staff, type };
                    } else {
                      const {
                        pitch,
                        duration,
                        type,
                        voice,
                        staff,
                        dot,
                        chord,
                        accidental,
                        stem,
                      } = note;
                      noteData = {
                        pitch,
                        duration,
                        type,
                        voice,
                        staff,
                        dot,
                        chord,
                        accidental,
                        stem,
                      };
                    }

                    // Check for time-modification and add it to noteData if present
                    if (note["time-modification"]) {
                      const timeModification = note["time-modification"][0];
                      noteData.timeModification = {
                        actualNotes: parseInt(
                          timeModification["actual-notes"][0],
                          10
                        ),
                        normalNotes: parseInt(
                          timeModification["normal-notes"][0],
                          10
                        ),
                      };
                    }

                    // Add the noteData object to the measureData.notes array
                    measureData.notes.push(noteData);
                  });
                } else {
                  // For a single note or rest
                  let noteData = {}; // Initialize an object to hold the note data

                  if (notes.rest) {
                    const { rest, duration, voice, staff, type } = notes;
                    noteData = { rest, duration, voice, staff, type };
                  } else {
                    const {
                      pitch,
                      duration,
                      type,
                      voice,
                      staff,
                      dot,
                      chord,
                      accidental,
                      stem,
                    } = notes;
                    noteData = {
                      pitch,
                      duration,
                      type,
                      voice,
                      staff,
                      dot,
                      chord,
                      accidental,
                      stem,
                    };

                    // Check for time-modification and add it to noteData if present
                    if (notes["time-modification"]) {
                      const timeModification = notes["time-modification"][0];
                      noteData.timeModification = {
                        actualNotes: parseInt(
                          timeModification["actual-notes"][0],
                          10
                        ),
                        normalNotes: parseInt(
                          timeModification["normal-notes"][0],
                          10
                        ),
                      };
                    }
                  }

                  // Add the noteData object to the measureData.notes array
                  measureData.notes.push(noteData);
                }
                //console.log(JSON.stringify(measureData));
                allNotesWithMeasureData.push(measureData);
              });
            });

            resolve({
              notes: allNotesWithMeasureData,
              time: firstMeasureTimeData,
            });
          }
        });
      }
    });
  });
}

module.exports = {
  parseXMLForCoordinates,
  parseMusicXML,
};
