// ------- TRANSLATOR

// removeCharacter() is used to surgically remove characters in a string.
// We used this to process chord detection, since we need to work backwards and correct the chord format for lilypond.
// This is due to the fact that the muxicXML file does not categorize the first note in a chord as such.

function removeCharacter(str, char) {
  const regex = new RegExp(char, "g");
  return str.replace(regex, "");
}

let tupletNoteCount = 0;
let inTuplet = false;
let tupletComplete = false;

function noteIsStartOfTuplet(note, index, notes) {
  if (!note.timeModification || tupletComplete) {
    return false;
  }

  // Start a new tuplet if not already in one or if the previous tuplet has ended
  if (
    !inTuplet ||
    (inTuplet && tupletNoteCount >= note.timeModification.actualNotes)
  ) {
    inTuplet = true;
    tupletNoteCount = 1; // Reset counter at the start of a tuplet
    return true;
  }

  return false;
}

function noteIsEndOfTuplet(note, index, notes) {
  if (!note.timeModification) {
    if (inTuplet) {
      inTuplet = false;
      tupletNoteCount = 0;
    }
    return false;
  }

  tupletNoteCount++;

  // Check if the tuplet should end
  if (
    inTuplet &&
    (tupletNoteCount === note.timeModification.actualNotes + 1 ||
      index === notes.length - 1)
  ) {
    inTuplet = false;
    tupletComplete = true;
    return true;
  }

  return false;
}

// Helper function to get LilyPond duration notation
function getLilypondDuration(note) {
  let type = String(note.type);

  switch (type) {
    case "32nd":
      return "32"; // 32nd note
    case "16th":
      return "16"; // 16th note
    case "eighth":
      return "8"; // Eighth note
    case "quarter":
      return "4"; // Quarter note
    case "half":
      return "2"; // Half note
    case "whole":
      return "1"; // Whole note
    // Add more cases as needed
    default:
      console.log("Unhandled note type: " + type);
      return "4."; // Default to quarter note if not handled
  }
}

// noteToLilypond() is used to process each note in the musicXML.
// This will create and return a string variable that will include the note's step, octave, chord info, dot info, and type info in the correct format.

function noteToLilypond(note, textVIndex) {
  let lilypondNote = "";
  let vIndex;

  if (note.rest) {
    // Directly output the rest with its duration
    const restDuration = getLilypondDuration(note);
    lilypondNote += `r${restDuration}`;
  } else {
    // Actual note, not a rest!
    // Handle pitch
    const { pitch, stem } = note;
    const step = pitch[0].step[0];
    const alter = pitch[0].alter ? pitch[0].alter[0] : null;
    const octave = pitch[0].octave[0];

    let accidental = "";
    if (alter === "1") {
      accidental = "is"; // Sharp
    } else if (alter === "-1") {
      accidental = "es"; // Flat
    }

    const stemDirection = stem ? stem[0]._ : "";
    let stemDirString;
    if (stemDirection == "up") {
      stemDirString = "\\stemUp ";
    } else if (stemDirection == "down") {
      stemDirString = "\\stemDown ";
    } else {
      stemDirString = "";
    }

    let octaveNum;

    //switch used to specify the octave to lilypond using the octave child in the note.
    switch (parseInt(octave)) {
      case 1:
        octaveNum = ",,";
        break;
      case 2:
        octaveNum = ",";
        break;
      case 3:
        octaveNum = "";
        break;
      case 4:
        octaveNum = "'";
        break;
      case 5:
        octaveNum = "''";
        break;
      case 6:
        octaveNum = "'''";
        break;
      case 7:
        octaveNum = "''''";
        break;
      default:
        console.log("octave = " + octave);
        octaveNum = "";
        break;
    }
    lilypondNote += stemDirString + step.toLowerCase() + accidental + octaveNum;

    if (accidental !== "") {
      lilypondNote += "!";
    }

    // Handle duration
    const { type } = note;
    let numType;
    switch (type[0]) {
      case "32nd":
        numType = "32";
        break;
      case "16th":
        numType = "16";
        break;
      case "eighth":
        numType = "8";
        break;
      case "quarter":
        numType = "4";
        break;
      case "half":
        numType = "2";
        break;
      case "whole":
        numType = "1";
        break;
      default:
        numType = "err";
    }
    lilypondNote += numType;

    // Handle Dot

    const { dot } = note;
    if (dot) {
      lilypondNote += ".";
    }

    // Handle Chord
    // This will initially write the chord incorrectly if it has more than 2 notes. It will write the middle note as the end note of the chord as well.
    // We handle this in notes_to_lilypond() by reversing an array of the notes and detecting and processing when we enter and exit a chord.
    const { chord } = note;
    if (chord) {
      if (dot) {
        lilypondNote = lilypondNote.slice(0, -2);
        lilypondNote += `>${numType}.`;
      } else {
        lilypondNote = lilypondNote.slice(0, -1);
        lilypondNote += `>${numType}`;
      }
    }
  }

  return lilypondNote;
}

// notes_to_lilypond() isolates the notes by their respective measure, then staff, then voice.
// These notes, grouped by voice, staff, & measure, will then be rewritten into lilypond format.

let measureCount = 0;

function notes_to_lilypond(notes, timeData, collectionName) {
  const breakMeasures = {};
  let staff_code = []; // staff_code will be an array of strings, with each array member being the code for a given staff. These will be compiled together in lilypond_code.
  let lilypond_code = '\n\\version "2.24.1"\n\n';
  let multipleStaves = true;

  lilypond_code += "\\header {\n";
  lilypond_code += "  title = \\markup {\n";
  lilypond_code += "    \\column {\n";
  lilypond_code += `      "${collectionName}"\n`;
  lilypond_code += `      \\vspace #2\n`;
  lilypond_code += `    }\n`;
  lilypond_code += `  }\n`;
  lilypond_code += `}\n`;

  lilypond_code += "\\paper {\n";
  lilypond_code += "  ragged-right = ##f\n";
  lilypond_code += "}\n\n";
  lilypond_code += "\\score {\n";
  lilypond_code += "  <<\n";

  console.log("NOTES: " + JSON.stringify(notes));

  let measureNumbers;

  notes = notes.flat();

  // Check if notes is an array
  if (Array.isArray(notes)) {
    // Flatten the array and find all unique measure numbers
    measureNumbers = new Set(notes.map((measure) => measure.number));
    console.log("MEASURE NUMBERS: " + Array.from(measureNumbers).join(", "));
  } else {
    console.log("NOTES is not an array or is undefined.");
  }

  console.log("MEASURE NUMBERS: " + Array.from(measureNumbers).join(", "));

  let firstStaffDone = false;
  const maxMeasureNumber = Math.max(...Array.from(measureNumbers));
  // Generate LilyPond code for each measure
  measureNumbers.forEach((measureNumber) => {
    const currentmeasure = notes.find(
      (measure) => measure.number === measureNumber
    );

    console.log("CURR MEASURE NOTES: " + JSON.stringify(currentmeasure));

    const measureNotes = currentmeasure.notes;

    console.log("MEASURE NOTES: " + JSON.stringify(measureNotes));

    // Get exact # of staffs per measure... Ex: 2 staffs detected = [1, 2]
    const staffNumbers = measureNotes.map((note) => parseInt(note.staff));

    // Check if staffNumbers contains NaN values
    const hasNaN = staffNumbers.some((value) => isNaN(value));

    if (hasNaN) {
      multipleStaves = false;
      // If there are NaN values, build LilyPond by measure and voice
      // Initialize the LilyPond code for the measure
      let measureCode = "";
      if (firstStaffDone == false) {
        measureCode = `\\new Staff {\n`;

        // Assuming you have clef and time signature information available
        // Replace 'clef' and 'time signature' with your actual data
        measureCode += `  \\clef treble\n`;
        measureCode += `  \\time ${timeData.beats}/${timeData.beatType}\n`;
      }

      // Initialize variable to track if we're inside a tuplet
      let inTuplet = false;

      // Create a set of voice numbers for the current measure
      const voiceNumbers = measureNotes.map((note) => parseInt(note.voice));
      const uniqueVoiceNumArray = Array.from(new Set(voiceNumbers));

      uniqueVoiceNumArray.forEach((voice, vIndex) => {
        vIndex += 1;
        let textVIndex = "";

        // Create a new Voice for each voice in the measure
        measureCode += `  \\new Voice {\n`;

        switch (vIndex) {
          case 1:
            textVIndex = "One";
            break;
          case 2:
            textVIndex = "Two";
            break;
          default:
            textVIndex = "One";
            break;
        }

        measureCode += `    \\voice${textVIndex}\n`;

        // Process notes for this voice (replace with your logic)
        const voiceNotes = measureNotes.filter(
          (note) => parseInt(note.voice) === voice
        );

        voiceNotes.forEach((note, index) => {
          // Check if this note is the start of a tuplet
          if (!inTuplet && noteIsStartOfTuplet(note, index, voiceNotes)) {
            const { actualNotes, normalNotes } = note.timeModification;
            measureCode += `\\tuplet ${actualNotes}/${normalNotes} { `; // Append to measureCode
            inTuplet = true;
          }

          // Add the note's LilyPond syntax
          measureCode += noteToLilypond(note, textVIndex); // Append to measureCode

          // Check if this note is the end of a tuplet
          if (inTuplet && noteIsEndOfTuplet(note, index, voiceNotes)) {
            measureCode += " } "; // Append to measureCode
            inTuplet = false;
          }
        });

        tupletComplete = false;

        measureCode += `  }\n`; // Close the Voice block

        measureCount++;

        if (measureCount % 4 == 0) {
          measureCode += `    \\break\n\n`;
        }
      });

      if (measureNumber == maxMeasureNumber) {
        measureCode += `}\n`; // Close the Staff block
      }

      // Add the measure code to the appropriate staff_code array element (index)
      staff_code[measureNumber] = measureCode;
      firstStaffDone = true;
    } else {
      const uniqueStaffNumArray = [];
      for (let i = 0; i < staffNumbers.length; i++) {
        if (i === 0 || staffNumbers[i] !== staffNumbers[i - 1]) {
          uniqueStaffNumArray.push(staffNumbers[i]);
        }
      }
      console.log(
        "STAFF NUMBERS: " + Array.from(uniqueStaffNumArray).join(", ")
      );

      // For each staff number found..
      // This is where the staff_code array is built, controlled by index.
      uniqueStaffNumArray.forEach((staffNumber, index) => {
        // Pulls the notes in the current measure that belong to the current staff number
        const staffNotes = measureNotes.filter(
          (note) => parseInt(note.staff) === staffNumber
        );
        console.log("STAFF NOTES: " + JSON.stringify(staffNotes));

        // initializes the TOP of the staff:
        staff_code[index] = staff_code[index] || "";

        if (staff_code[index] == "") {
          staff_code[index] += `  \\new Staff {\n`;

          let clef;
          // Assuming staff 1 = treble, 2 = bass, etc.
          switch (staffNumber) {
            case 1:
              clef = "treble";
              break;
            case 2:
              clef = "bass";
              break;
            default:
              console.log("STAFF NUMBER: " + staffNotes);
              break;
          }
          staff_code[index] += `    \\clef ${clef}\n`;
          staff_code[
            index
          ] += `    \\time ${timeData.beats}/${timeData.beatType}\n`;

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
        console.log(
          "VOICE NUMBERS: " + Array.from(uniqueVoiceNumArray).join(", ")
        );

        // For each voice on the staff, add the notes in them in order.
        uniqueVoiceNumArray.forEach((voice, vIndex) => {
          vIndex += 1;
          let textVIndex = "";

          // Pulls the notes in the current staff that belong to the current voice number
          const voiceNotes = staffNotes.filter(
            (note) => parseInt(note.voice) === voice
          );
          console.log("VOICE NOTES: " + JSON.stringify(voiceNotes));

          switch (vIndex) {
            case 1:
              if (staffNumber == 1) {
                textVIndex = "One";
              } else if (staffNumber == 2) {
                textVIndex = "Four";
              }
              break;
            case 2:
              if (staffNumber == 1) {
                textVIndex = "Two";
              } else if (staffNumber == 2) {
                textVIndex = "Three";
              }
              break;
            default:
              textVIndex = "One";
              break;
          }

          if (vIndex == 1) {
            staff_code[
              index
            ] += `    \\new Voice = \"${staffNumber}${measureNumber}\" {\n`;
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
            lilynotes.push(noteToLilypond(note, textVIndex));
          });
          console.log("LILYNOTES: " + Array.from(lilynotes).join(", "));

          lilynotes.reverse();

          console.log(
            "LILYNOTES REVERSED: " + Array.from(lilynotes).join(", ")
          );

          let inChord = false;
          let stemDirection;
          lilynotes.forEach((note, i) => {
            if (note.includes(">") && inChord == false) {
              note = note.replace("\\stemDown", "");
              note = note.replace("\\stemUp", "");
              inChord = true;
              lilynotes[i] = note;
            } else if (note.includes(">") && inChord == true) {
              //middle note
              note = removeCharacter(note, ">");
              note = note.replace("\\stemDown", "");
              note = note.replace("\\stemUp", "");
              if (note.includes(".")) {
                note = note.slice(0, -2);
              } else {
                note = note.slice(0, -1);
              }
              lilynotes[i] = note;
            } else if (!note.includes(">") && inChord == true) {
              if (note.includes("\\stemDown")) {
                stemDirection = "\\stemDown ";
              } else if (note.includes("\\stemUp")) {
                stemDirection = "\\stemUp ";
              }

              note = note.replace("\\stemDown", "");
              note = note.replace("\\stemUp", "");

              if (note.includes(".")) {
                note = note.slice(0, -2);
                lilynotes[i] = stemDirection + "<" + note;
              } else {
                note = note.slice(0, -1);
                lilynotes[i] = stemDirection + "<" + note;
              }

              inChord = false;
            }
          });

          //reverses lilyntoes again to put it back in the correct order
          lilynotes.reverse();
          console.log(
            "LILYNOTES PROCESSED: " + Array.from(lilynotes).join(", ")
          );

          // Adds the now-chord-corrected notes into staff_code in order
          lilynotes.forEach((note) => {
            staff_code[index] += `${note}  `;
          });

          // Check if a break is needed
          if (measureNumber % 4 === 0) {
            staff_code[index] += "\\break\n";
          }

          staff_code[index] += `\n        }\n`;
        });

        staff_code[index] += `      >>\n`;
        staff_code[index] += `      \\oneVoice\n`;
        staff_code[index] += `    }|\n\n`;

        console.log(`\nSTAFF CODE #${index}: \n\n` + staff_code[index]);
      });
    }
  });

  //insert the staffs in staff_code into lilypond_code
  staff_code.forEach((staff) => {
    lilypond_code += staff;

    if (multipleStaves) {
      lilypond_code += `  }\n\n`;
    }
  });

  lilypond_code += "  >>\n";
  lilypond_code += "}\n";
  console.log(`\nLILY CODE: \n\n` + lilypond_code);
  console.log("TIME DATA: " + JSON.stringify(timeData));
  return lilypond_code;
}

module.exports = { removeCharacter, noteToLilypond, notes_to_lilypond };
