// Constraint Solver Web Worker — тонкая обёртка над ядром решателя.
import { solveSketch, type SketchEntity, type SketchConstraint } from "../sketcher/solver/solveSketch";

interface SolverInput {
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

self.onmessage = (e: MessageEvent<SolverInput>) => {
  self.postMessage(solveSketch(e.data.entities, e.data.constraints));
};

export {};
