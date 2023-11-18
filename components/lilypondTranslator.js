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

function noteToLilypond(note, textVIndex) {
  let lilypondNote = "";
  let vIndex;

  if (note.rest) {
    if (!(note.rest[0].$ && note.rest[0].$.measure === "yes")) {
      switch (textVIndex) {
        case "One":
          vIndex = "1";
          break;
        case "Two":
          vIndex = "2";
          break;
        case "Three":
          vIndex = "3";
          break;
        case "Four":
          vIndex = "4";
          break;
        default:
      }

      lilypondNote += `\\override Rest.staff-position = #${vIndex}\n`;
      lilypondNote += "          r"; // Rest starter
    } else {
      lilypondNote += "R"; // Rest starter
    }

    const { duration } = note;
    const stringDuration = String(duration);
    let currDuration;

    console.log("DURATION : " + duration);
    console.log("Type of DURATION : " + typeof duration);
    console.log("SDURATION : " + stringDuration);
    console.log("Type of SDURATION : " + typeof stringDuration);

    switch (stringDuration) {
      case "1":
        currDuration = "4"; // Quarter rest
        break;
      case "2":
        currDuration = "2"; // Half rest
        break;
      case "3":
        currDuration = "2."; // Dotted half rest
        break;
      case "4":
        currDuration = "1"; // Whole rest
        break;
      case "5":
        currDuration = "2.~R4"; // Dotted half rest tied to quarter rest
        break;
      case "6":
        currDuration = "1~R4"; // Whole rest tied to quarter rest
        break;
      case "7":
        currDuration = "1~R2"; // Whole rest tied to half rest
        break;
      // Add more cases as needed
      default:
        currDuration = "4"; // Default to quarter rest if not handled
        break;
    }

    if (!(note.rest[0].$ && note.rest[0].$.measure === "yes")) {
      lilypondNote += currDuration + "\n";
      lilypondNote += "          \\revert Rest.staff-position\n";
      lilypondNote += "        ";
    } else {
      lilypondNote += currDuration;
    }
  } else {
    // Actual note, not a rest!
    // Handle pitch
    const { pitch, stem } = note;
    const step = pitch[0].step[0];
    const octave = pitch[0].octave[0];

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
    lilypondNote += stemDirString + step.toLowerCase() + octaveNum;

    // Handle duration
    const { type } = note;
    let numType;
    switch (type[0]) {
      case "eighth":
        numType = "8";
        break;
      case "quarter":
        numType = "4";
        break;
      case "half":
        numType = "2";
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

function notes_to_lilypond(notes) {
  const breakMeasures = {};
  let staff_code = []; // staff_code will be an array of strings, with each array member being the code for a given staff. These will be compiled together in lilypond_code.
  let lilypond_code = '\n\\version "2.24.1"\n\n';
  let multipleStaves = true;
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
        measureCode += `  \\time 4/4\n`;
      }

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

        voiceNotes.forEach((note) => {
          // Process and add LilyPond notation for each note
          const lilyNote = noteToLilypond(note, textVIndex); // Replace with your function
          measureCode += `    ${lilyNote}\n`;
        });

        measureCode += `  }\n`; // Close the Voice block
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
          staff_code[index] += `    \\time 4/4\n`;

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

          if (breakMeasures[measureNumber]) {
            staff_code[index] += `    \\break\n`;
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
  return lilypond_code;
}

module.exports = { removeCharacter, noteToLilypond, notes_to_lilypond };
