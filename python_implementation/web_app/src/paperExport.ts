import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import paperReproductionScript from "./reproduce.py?raw";

export type PaperFigureSize = "single" | "double";

export interface PaperRenderResult {
  svg: string;
  widthInches: number;
  heightInches: number;
}

export interface PaperRenderOptions {
  palette: "paper-colorblind";
  physicalSize: PaperFigureSize;
  widthInches: number;
  snapshotLayout: 1 | 2;
  suppressAnimationMarkers: true;
  exportMode: true;
}

export interface PaperPanelRenderer {
  id: string;
  title: string;
  csv: string;
  metadata: {
    axisLimits: Record<string, number[] | null>;
    units: Record<string, string>;
    seriesStyling: Array<{ series: string; color: string; dash: number[]; marker: string }>;
    downsampling: string;
  };
  render: (size: PaperFigureSize) => Promise<PaperRenderResult>;
}

export type PaperPanelExportSource = PaperPanelRenderer;

export interface PaperExportPanelManifest {
  id: string;
  title: string;
  dataFile: string;
  files: string[];
  metadata: PaperPanelRenderer["metadata"];
}

export interface PaperExportManifestV1 {
  schemaVersion: 1;
  application: {
    name: "OZwizard";
    version: string;
    sourceCommit: string;
    sourceUrl: string;
  };
  createdAt: string;
  theme: "paper";
  model: unknown;
  display: unknown;
  paper: unknown;
  grid: unknown;
  panels: PaperExportPanelManifest[];
  omittedPanels: Array<{ id: string; reason: string }>;
}

export interface PaperBundleOptions {
  manifest: PaperExportManifestV1;
  panels: PaperPanelExportSource[];
  onProgress?: (message: string) => void;
}

const PNG_DPI = 600;

function svgElement(svg: string): SVGSVGElement {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = documentNode.documentElement;
  if (root.localName !== "svg") throw new Error("Vector renderer did not return an SVG root");
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

function normalizedSvg(result: PaperRenderResult): string {
  const root = svgElement(result.svg);
  root.setAttribute("width", `${result.widthInches}in`);
  root.setAttribute("height", `${result.heightInches}in`);
  root.setAttribute("role", "img");
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", "#ffffff");
  root.insertBefore(background, root.firstChild);
  return new XMLSerializer().serializeToString(root);
}

async function pdfBytes(result: PaperRenderResult, svg: string): Promise<Uint8Array> {
  const orientation = result.widthInches >= result.heightInches ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "in", format: [result.widthInches, result.heightInches], compress: true });
  pdf.setProperties({ title: "OZwizard paper figure", creator: "OZwizard" });
  await svg2pdf(svgElement(svg), pdf, { x: 0, y: 0, width: result.widthInches, height: result.heightInches });
  return new Uint8Array(pdf.output("arraybuffer"));
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoder returned no data")), "image/png");
  });
}

async function pngBytes(result: PaperRenderResult, svg: string): Promise<Uint8Array> {
  const width = Math.round(result.widthInches * PNG_DPI);
  const height = Math.max(1, Math.round(result.heightInches * PNG_DPI));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG canvas context unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to rasterize exported SVG"));
      image.src = blobUrl;
    });
    context.drawImage(image, 0, 0, width, height);
    return new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());
  } finally {
    URL.revokeObjectURL(blobUrl);
    canvas.width = 1;
    canvas.height = 1;
  }
}

function readme(manifest: PaperExportManifestV1): string {
  return `OZwizard paper figure bundle
================================

Created: ${manifest.createdAt}
Source: ${manifest.application.sourceUrl}
Version: ${manifest.application.version}
Commit: ${manifest.application.sourceCommit}

Each visible panel is supplied separately in vector PDF and SVG at 3.4-inch
single-column and 7.1-inch double-column widths, plus a 600-dpi PNG fallback.
The matching CSV contains the numerical values represented by that panel.
manifest.json records the full model, solver, display, phase, and grid state.

Browser-generated PDF files are the canonical artwork. reproduce.py provides a
Matplotlib-oriented independent rendering of the archived CSV data. Install its
dependency with: python -m pip install -r requirements.txt

Omitted panels:
${manifest.omittedPanels.length ? manifest.omittedPanels.map((item) => `- ${item.id}: ${item.reason}`).join("\n") : "- none"}
`;
}

function aastexSnippets(panels: PaperExportPanelManifest[]): string {
  return panels.map((panel, index) => `%% ${panel.title}
\\begin{figure}
  \\centering
  \\includegraphics[width=\\columnwidth]{figures/${String(index + 1).padStart(2, "0")}-${panel.id}-single.pdf}
  \\caption{TODO: describe the ${panel.title} panel and identify the archived data.}
  \\label{fig:ozwizard-${panel.id}}
\\end{figure}

%% Double-column alternative:
%% \\includegraphics[width=\\textwidth]{figures/${String(index + 1).padStart(2, "0")}-${panel.id}-double.pdf}
`).join("\n");
}

function reproductionScript(): string {
  return paperReproductionScript;
}

export async function createPaperBundle(options: PaperBundleOptions): Promise<{ blob: Blob; filename: string; manifest: PaperExportManifestV1 }> {
  const manifest: PaperExportManifestV1 = { ...options.manifest, panels: [] };
  const chunks: Uint8Array[] = [];
  let settleArchive: (() => void) | null = null;
  let rejectArchive: ((error: Error) => void) | null = null;
  const archiveDone = new Promise<void>((resolve, reject) => {
    settleArchive = resolve;
    rejectArchive = reject;
  });
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      rejectArchive?.(error);
      return;
    }
    chunks.push(chunk);
    if (final) settleArchive?.();
  });
  const addFile = (name: string, data: Uint8Array, compress = true) => {
    const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    archive.add(file);
    file.push(data, true);
  };
  try {
    for (let panelIndex = 0; panelIndex < options.panels.length; panelIndex += 1) {
      const panel = options.panels[panelIndex];
      const prefix = `${String(panelIndex + 1).padStart(2, "0")}-${panel.id}`;
      const dataFile = `data/${prefix}.csv`;
      const panelManifest: PaperExportPanelManifest = { id: panel.id, title: panel.title, dataFile, files: [], metadata: panel.metadata };
      addFile(dataFile, strToU8(panel.csv));
      for (const size of ["single", "double"] as const) {
        options.onProgress?.(`Rendering ${panel.title} (${size})`);
        const result = await panel.render(size);
        const svg = normalizedSvg(result);
        const base = `figures/${prefix}-${size}`;
        addFile(`${base}.svg`, strToU8(svg));
        addFile(`${base}.pdf`, await pdfBytes(result, svg), false);
        addFile(`${base}.png`, await pngBytes(result, svg), false);
        panelManifest.files.push(`${base}.pdf`, `${base}.svg`, `${base}.png`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      manifest.panels.push(panelManifest);
    }
    addFile("manifest.json", strToU8(`${JSON.stringify(manifest, null, 2)}\n`));
    addFile("README.txt", strToU8(readme(manifest)));
    addFile("aastex-snippets.tex", strToU8(aastexSnippets(manifest.panels)));
    addFile("reproduce.py", strToU8(reproductionScript()));
    addFile("requirements.txt", strToU8("matplotlib==3.10.5\n"));
    options.onProgress?.("Compressing paper bundle");
    archive.end();
    await archiveDone;
  } catch (error) {
    archive.terminate();
    throw error;
  }
  const timestamp = manifest.createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return {
    blob: new Blob(chunks as unknown as BlobPart[], { type: "application/zip" }),
    filename: `ozwizard-paper-${timestamp}.zip`,
    manifest
  };
}

export function downloadPaperBundle(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
