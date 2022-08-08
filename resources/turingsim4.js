"use strict";

// @ADVANCED
// @TAPES 2
// @COMMA ;
// @ARROW --->
// @BLANK B
// @INIT I
// @HALT X
// @ACCEPT A


const MAX_TAPES = 16;
const BLANK = "";

class ProgrammingError extends Error {
  name;
  line;
  constructor(message, line) {
    super(message);
    this.name = "ProgrammingError";
    this.line = line;
  }
}

class StateError extends Error {
  name;
  constructor(message) {
    super(message);
    this.name = "StateError";
  }
}

class TuringControlMessage {
  type;
  data;
  constructor(type, data) {
    this.type = type;
    this.data = data;
  }
  static make(type, data) {
    return new TuringControlMessage(type, data);
  }
}

/*
class BTreeBasedTape {

    #tree;

    constructor() {
        this.#tree = new BTree([], (l, r) => l - r, 32);
    }

    static deserialize(serialized) {
        let instance = new BTreeBasedTape();
        for (let [index, value] of serialized) {
            instance.set(index, value);
        }
        return instance;
    }

    get(i) {
        return this.#tree.get(i, BLANK);
    }

    set(i, symbol) {
        if (symbol === BLANK) {
            this.#tree.delete(i);
        } else {
            this.#tree.set(i, symbol, true);
        }
        return this;
    }

    minIndex() {
        return this.#tree.isEmpty ? 0 : this.#tree.minKey();
    }

    maxIndex() {
        return this.#tree.isEmpty ? 0 : this.#tree.maxKey();
    }

    clear() {
        this.#tree.clear();
    }

    denseSlice(inclusiveLower, inclusiveUpper) {
        // note: this is sorted
        let entries = this.#tree.getRange(inclusiveLower, inclusiveUpper, true);
        if (entries.length === 0)
            return [];
        let denseArray = [];
        for (let i = 0; i < entries.length - 1; ++i) {
            let [thisKey, thisValue] = entries[i];
            let [nextKey, _] = entries[i + 1];
            denseArray[denseArray.length] = thisValue;
            denseArray.push(...new Array(nextKey - thisKey - 1).fill(BLANK));
        }
        let [_, lastValue] = entries[entries.length - 1];
        denseArray[denseArray.length] = lastValue;
        return denseArray;
    }

    toDenseArray() {
        return this.denseSlice(this.minIndex(), this.maxIndex());
    }

    toSparseArray() {
        return [...this.#tree.entries()];
    }

    serialize() {
        return this.toSparseArray();
    }
}
*/

/** Represents a single, infinite tape. */
class MapBasedTape {

  #map;

  constructor() {
    this.#map = new Map();
  }

  static deserialize(serialized) {
    let instance = new MapBasedTape();
    for (let [index, value] of serialized) {
      instance.set(index, value);
    }
    return instance;
  }

  get(i) {
    return this.#map.has(i) ? this.#map.get(i) : BLANK;
  }

  set(i, symbol) {
    if (symbol === BLANK) {
      this.#map.delete(i);
    } else {
      this.#map.set(i, symbol, true);
    }
    return this;
  }

  minIndex() {
    return this.#map.size === 0 ? 0 : Math.min(...this.#map.keys());
  }

  maxIndex() {
    return this.#map.size === 0 ? 0 : Math.max(...this.#map.keys());
  }

  clear() {
    this.#map.clear();
  }

  denseSlice(inclusiveLower, inclusiveUpper) {
    return Array.from({length: inclusiveUpper - inclusiveLower + 1}, (x, i) => this.get(i + inclusiveLower));
  }

  toDenseArray() {
    return this.denseSlice(this.minIndex(), this.maxIndex());
  }

  toSparseArray() {
    return [...this.#map.entries()];
  }

  serialize() {
    return this.toSparseArray();
  }
}

/** Represents a movement instruction for a multi-tape turing machine. */
let Move = Object.freeze({
  None: "None",
  Left: "Left",
  Right: "Right"
});

/** Represents a specialized Map for looking up instructions. */
class InstructionTable {

  #instructionMap;
  #asSequence;

  constructor() {
    this.#instructionMap = new Map();
    this.#asSequence = [];
  }

  static deserialize(serialized) {
    let instance = new InstructionTable();
    serialized.forEach(e => instance.update(e.state, e.reads, e.instruction.nextState, e.instruction.writes, e.instruction.moves));
    return instance;
  }

  static #asKey(currentState, currentSymbols) {
    let elements = [currentState].concat(currentSymbols);
    return elements.map(e => e.toString().replace(",", ",,")).join(",");
  }

  update(currentState, currentSymbols, nextState, nextSymbols, directions) {
    let instruction = {nextState: nextState, writes: nextSymbols, moves: directions};
    this.#instructionMap.set(InstructionTable.#asKey(currentState, currentSymbols), instruction);
    this.#asSequence[this.#asSequence.length] = {state: currentState, reads: currentSymbols, instruction: instruction};
  }

  has(currentState, currentSymbols) {
    return this.#instructionMap.has(InstructionTable.#asKey(currentState, currentSymbols));
  }

  lookup(currentState, currentSymbols) {
    return this.#instructionMap.get(InstructionTable.#asKey(currentState, currentSymbols));
  }

  debugString() {
    return this.#asSequence.map(rule => {
      let writesMoves = rule.instruction.writes.map((w, i) => `(${w}, ${rule.instruction.moves[i]})`);
      return `${rule.state} [${rule.reads}] -> ${rule.instruction.nextState} [${writesMoves}]\n`;
    }).join("");
  }

  definedStates() {
    return new Set(this.#asSequence.map(e => e.currentState));
  }

  referencedStates() {
    return new Set(this.#asSequence.map(e => e.instruction.nextState));
  }

  serialize() {
    return this.#asSequence;
  }
}

/** Represents the compiled program for a multi-tape turing machine. */
let Program = (() => {
  class Program {

    initialState;
    tapeCount;
    haltStates;
    acceptingStates;
    instructions;

    constructor() {}

    static deserialize(serialized) {
      let instance = new Program();
      instance.initialState = serialized.initialState;
      instance.tapeCount = serialized.tapeCount;
      instance.haltStates = new Set(serialized.haltStates);
      instance.acceptingStates = new Set(serialized.acceptingStates);
      instance.instructions = InstructionTable.deserialize(serialized.instructions);
      return instance;
    }

    static make(programText) {
      const NEW_SYNTAX_FLAG = "@ADVANCED";

      let instance = new Program();
      instance.initialState = null;
      instance.haltStates = null;
      instance.acceptingStates = null;
      instance.tapeCount = null;
      instance.instructions = new InstructionTable();

      let program = Program.#readProgram(programText)

      if (program.preprocessorLines.length === 0 && program.programLines.length === 0)
        throw new StateError("No programming entered.");

      if (program.preprocessorLines.length > 0) {
        let [firstLine, ...remainingPreprocessorLines] = program.preprocessorLines;

        if (firstLine.line !== NEW_SYNTAX_FLAG)
          throw new ProgrammingError(`To use meta instructions, write '${NEW_SYNTAX_FLAG}' as the first instruction of the program.`, firstLine.index);

        instance.#newParser(program.programLines, remainingPreprocessorLines);
      } else {
        instance.#legacyParser(program.programLines);
      }
      return instance;
    }

    #legacyParser(programLines) {
      let commandPattern = /^\s*([0-9A-Za-z]{1,3}),([^, ]) +([0-9A-Za-z]{1,3}),([^, ])(?:,([>_<]))?\s*(?:#.*)?$/;

      for (let lineInfo of programLines) {
        let line = lineInfo.line;

        if (/^\s*$/.exec(line)) // empty lines
          continue;
        if (/^\s*#.*$/.exec(line)) // comment lines
          continue;

        let match = commandPattern.exec(line);
        if (!match)
          throw new ProgrammingError("Syntax error.", lineInfo.index);

        let stateName = match[1];
        let char = (match[2] === "_") ? BLANK : match[2];
        let nextState = match[3];
        let newChar = (match[4] === "_") ? BLANK : match[4];
        let dirChar = match[5] || "_";
        let direction = (dirChar === ">") ? Move.Right : (dirChar === "<") ? Move.Left : Move.None;

        if ("H" === stateName)
          throw new ProgrammingError("Attempting to override halt state.", lineInfo.index);

        if (this.instructions.has(stateName, [char]))
          throw new ProgrammingError("Trying to override existing state transition.", lineInfo.index);

        this.instructions.update(stateName, [char], nextState, [newChar], [direction]);
      }

      this.initialState = "1";
      this.haltStates = new Set(["H"]);
      this.acceptingStates = new Set();
      this.tapeCount = 1;
    }

    #newParser(programLines, preprocessorLines) {
      let comma = null;
      let arrow = null;
      let blankSymbol = null;

      this.haltStates = new Set();
      this.acceptingStates = new Set();

      const preprocessorSyntax = /^@(?<instruction>[A-Z]+)\s+(?<argument>\S+)$/;

      for (const line of preprocessorLines) {
        const match = preprocessorSyntax.exec(line.line);
        if (match == null)
          throw new ProgrammingError("Illegal meta instruction. Did you forget to pass an argument?", line.index);
        const instruction = match.groups.instruction;
        const argument = match.groups.argument;

        switch (instruction) {
          case "TAPES":
            const parsed = parseInt(argument, 10);
            if (isNaN(parsed) || parsed < 1 || parsed > MAX_TAPES)
              throw new ProgrammingError("Invalid tape count.", line.index);
            if (this.tapeCount !== null)
              throw new ProgrammingError("Duplicate tape count instruction.", line.index);
            this.tapeCount = parsed;
            break;
          case "COMMA":
            if (comma !== null)
              throw new ProgrammingError("Duplicate comma symbol override instruction.", line.index);
            comma = argument;
            break;
          case "ARROW":
            if (arrow !== null)
              throw new ProgrammingError("Duplicate arrow symbol override instruction.", line.index);
            arrow = argument;
            break;
          case "BLANK":
            if (blankSymbol !== null)
              throw new ProgrammingError("Duplicate blank symbol instruction.", line.index);
            blankSymbol = argument;
            break;
          case "INIT":
            if (this.initialState !== null)
              throw new ProgrammingError("Duplicate initial state instruction.", line.index);
            this.initialState = argument;
            break;
          case "HALT":
            this.haltStates.add(argument);
            break;
          case "ACCEPT":
            this.acceptingStates.add(argument);
            break;
          default:
            throw new ProgrammingError("Illegal meta instruction. Valid instructions are @TAPES, @COMMA, @ARROW, @BLANK, @INIT, @HALT, @ACCEPT.", line.index);
        }
      }

      if (comma === null) comma = ",";
      if (arrow === null) arrow = "->";
      if (this.tapeCount === null) this.tapeCount = 1;

      if (this.initialState === null)
        throw new StateError("Please specify a valid initial state using @INIT.");
      if (blankSymbol === null)
        throw new StateError("Please specify a valid blank symbol using @BLANK.");
      if (comma === arrow)
        throw new StateError("ARROW and COMMA need to be distinct.");
      if (new Set([comma, arrow, blankSymbol]).size !== 3)
        throw new StateError("ARROW, COMMA, BLANK need to be distinct.");
      if (new Set([comma, arrow, this.initialState]).size !== 3)
        throw new StateError("ARROW, COMMA, INIT need to be distinct.");

      for (const line of programLines) {
        let strippedLine = line.line.replace(/\s+/g, "");
        let conditionAndAction = strippedLine.split(arrow);
        if (conditionAndAction.length !== 2)
          throw new ProgrammingError(`Expected a single arrow (${arrow}).`, line.index)

        let condition = conditionAndAction[0].split(comma);
        if (condition.length !== this.tapeCount + 1)
          throw new ProgrammingError(`Expected ${this.tapeCount} comma(s) (${comma}) before the arrow (${arrow}).`, line.index);
        let stateName = condition[0];
        let symbols = condition.slice(1).map(s => s === blankSymbol ? BLANK : s);

        if (this.instructions.has(stateName, symbols))
          throw new ProgrammingError("Trying to override existing state transition.", line.index);

        let validSizes = new Set([this.tapeCount + 2, this.tapeCount * 2 + 1]);
        let validSizesString = [...validSizes].map(s => s - 1).join(" or ");
        let action = conditionAndAction[1].split(comma);
        if (!validSizes.has(action.length))
          throw new ProgrammingError(`Expected ${validSizesString} commas (${comma}) after the arrow (${arrow}).`, line.index);
        let targetState = action[0];
        let newSymbols = action.slice(1, this.tapeCount + 1).map(s => s === blankSymbol ? BLANK : s);
        let directions = (() => {
          let directionsMapping = new Map().set("_", Move.None).set(">", Move.Right).set("<", Move.Left).set("R", Move.Right).set("L", Move.Left);
          let directionsRaw = action.slice(this.tapeCount + 1);
          if (directionsRaw.filter(d => !directionsMapping.has(d)).length > 0)
            throw new ProgrammingError(`Directions can only be given by ">"/"R" or "<"/"L" or "_".`, line.index);
          if (directionsRaw.length === 1) {
            directionsRaw = new Array(this.tapeCount).fill(directionsRaw[0]);
          }
          return directionsRaw.map(d => directionsMapping.get(d));
        })();

        if (this.instructions.has(stateName, symbols))
          throw new ProgrammingError(`Duplicate definition of a transition rule.`, line.index);

        this.instructions.update(stateName, symbols, targetState, newSymbols, directions);
      }
    }

    static #readProgram(programText) {
      let programLines = [];
      let preprocessorLines = [];

      let lines = programText.split("\n");

      for (let i = 0; i < lines.length; ++i) {
        let rawLine = lines[i];
        let lineWithIndex = {"line": rawLine, "index": i + 1};

        if (rawLine.replace(/\s+/g, "").length === 0 || rawLine.startsWith("#"))
          continue;

        if (rawLine.startsWith("@")) {
          preprocessorLines[preprocessorLines.length] = lineWithIndex;
        } else {
          programLines[programLines.length] = lineWithIndex;
        }
      }

      let lastPreprocessorLine = Math.max(...preprocessorLines.map(line => line.index));
      let firstProgramLine = Math.min(...programLines.map(line => line.index));
      if (lastPreprocessorLine > firstProgramLine) {
        throw new ProgrammingError("Meta instructions can only occur at the start of the program.", lastPreprocessorLine);
      }

      return {
        programLines: programLines,
        preprocessorLines: preprocessorLines
      };
    }

    debugString() {
      return `TAPES: ${this.tapeCount}\nINIT: ${this.initialState}\nHALT: {${[...this.haltStates]}}\n`
        + `ACCEPT: {${[...this.acceptingStates]}}\n\n` + this.instructions.debugString();
    }

    serialize() {
      return {
        initialState: this.initialState,
        tapeCount: this.tapeCount,
        haltStates: [...this.haltStates],
        acceptingStates: [...this.acceptingStates],
        instructions: this.instructions.serialize()
      };
    }
  }
  return {make: Program.make, deserialize: Program.deserialize};
})();

const Tape = MapBasedTape;

/** Represents a turing machine including programming and current state.
 *
 *  This class is designed to maintain a relatively stable interface.
 */
let TuringMachine = (() => {
  class TuringMachine {

    #program;
    #state;
    #tapes;

    static deserialize(serialized) {
      let instance = new TuringMachine();
      instance.#program = Program.deserialize(serialized.program);
      instance.#state = serialized.state;
      instance.#tapes = [];
      serialized.tapes.forEach((s, i) => instance.#tapes[i] = Tape.deserialize(s));
      return instance;
    }

    static make(program) {
      let instance = new TuringMachine();
      instance.#program = program;
      instance.#state = Object.create(null);
      instance.reset();
      return instance;
    }

    reset() {
      this.#tapes = [...new Array(this.getTapeCount())].map(_ => new Tape());
      this.#state.halt = false;
      this.#state.accept = false;
      this.#state.missingTransition = false;
      this.#state.currentState = this.#program.initialState;
      this.#state.transitions = 0;
      this.#state.tapeTransitions = new Array(this.getTapeCount()).fill(0);
      this.#state.tapeSymbols = new Array(this.getTapeCount()).fill(0);
      this.#state.tapePositions = new Array(this.getTapeCount()).fill(0);
      this.#state.tapeLastDirections = new Array(this.getTapeCount()).fill(Move.None);
      this.#state.accept = this.#program.acceptingStates.has(this.#state.currentState);
    }

    advance() {
      if (this.isHalted())
        throw new StateError("Halt state reached.");

      let currentSymbols = this.#state.tapePositions.map((pos, tape) => this.#tapes[tape].get(pos));
      let instruction = this.#program.instructions.lookup(this.#state.currentState, currentSymbols);

      if (typeof instruction === "undefined") {
        this.#state.halt = true;
        this.#state.missingTransition = true;
        for (let tape = 0; tape < this.getTapeCount(); ++tape) {
          this.#state.tapeLastDirections[tape] = Move.None;
        }
      } else {
        this.#state.transitions += 1;
        this.#state.currentState = instruction.nextState;
        this.#state.accept = this.#program.acceptingStates.has(this.#state.currentState);
        for (let tape = 0; tape < this.getTapeCount(); ++tape) {
          let newSymbol = instruction.writes[tape];

          this.setTapeEntry(tape, this.#state.tapePositions[tape], newSymbol);
          this.#state.tapePositions[tape] += instruction.moves[tape] === Move.Left ? -1 : instruction.moves[tape] === Move.Right ? 1 : 0;
          this.#state.tapeLastDirections[tape] = instruction.moves[tape];

          if (instruction.moves[tape] !== Move.None) {
            this.#state.tapeTransitions[tape] += 1;
          }
        }
        if (this.#program.haltStates.has(instruction.nextState)) {
          this.#state.halt = true;
        }
      }
    }

    getTapeCount() {
      return this.#program.tapeCount;
    }

    getCurrentState() {
      return this.#state.currentState;
    }

    getTotalTransitions() {
      return this.#state.transitions;
    }

    isHalted() {
      return this.#state.halt;
    }

    isAccepting() {
      return this.#state.accept;
    }

    isMissingTransition() {
      return this.#state.missingTransition;
    }

    getTapeTransitions(tape) {
      return this.#state.tapeTransitions[tape];
    }

    getTapeSymbols(tape) {
      return this.#state.tapeSymbols[tape];
    }

    getTapePosition(tape) {
      return this.#state.tapePositions[tape];
    }

    getTapeLastDirection(tape) {
      return this.#state.tapeLastDirections[tape];
    }

    getTapeMin(tape) {
      return this.#tapes[tape].minIndex();
    }

    getTapeMax(tape) {
      return this.#tapes[tape].maxIndex();
    }

    getTapeSparse(tape) {
      return this.#tapes[tape].toSparseArray();
    }

    getTapeDense(tape) {
      return this.#tapes[tape].toDenseArray();
    }

    getTapeEntry(tape, index) {
      return this.#tapes[tape].get(index);
    }

    setTapeEntry(tape, index, symbol) {
      let oldSymbol = this.#tapes[tape].get(index);
      if (oldSymbol === BLANK && symbol !== BLANK) {
        this.#state.tapeSymbols[tape] += 1;
      }
      if (oldSymbol !== BLANK && symbol === BLANK) {
        this.#state.tapeSymbols[tape] -= 1;
      }
      this.#tapes[tape].set(index, symbol);
    }

    serialize() {
      return {
        program: this.#program.serialize(),
        state: this.#state,
        tapes: this.#tapes.map(t => t.serialize())
      };
    }
  }
  return {make: TuringMachine.make, deserialize: TuringMachine.deserialize};
})();
