import m from "mithril";
import "./styles.css";

// Types
interface ImageInfo {
  file: File;
  img: HTMLImageElement;
  name: string;
  startX: number;
  originalHeight: number; // Store original dimensions
  originalWidth: number;
  height: number; // Current scaled dimensions
  width: number;
  loaded: boolean;
}

interface State {
  images: ImageInfo[];
  sortedImages: ImageInfo[];
  exportName: string;
  exportFormat: "webp" | "png" | "jpg";
  scale: number;
  dragging: boolean;
  canvas: HTMLCanvasElement | null;
  spritesheet: string | null;
}

// Helpers
const naturalSort = (a: string, b: string): number => {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return collator.compare(a, b);
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

const drawSpritesheet = (state: State): void => {
  if (!state.canvas || state.sortedImages.length === 0) return;

  const padding = 2;
  let totalWidth = 0;
  let maxHeight = 0;

  state.sortedImages.forEach((img) => {
    totalWidth += img.width + padding;
    maxHeight = Math.max(maxHeight, img.height);
  });

  state.canvas.width = totalWidth;
  state.canvas.height = maxHeight;

  const ctx = state.canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

  let currentX = 0;
  state.sortedImages.forEach((img, index) => {
    const startX = currentX + padding;
    state.sortedImages[index].startX = startX;
    ctx.drawImage(img.img, startX, 0, img.width, img.height);
    currentX += img.width + 2 * padding;
  });

  const format =
    state.exportFormat === "webp" && state.canvas.width > 16383
      ? "png"
      : state.exportFormat;
  state.spritesheet = state.canvas.toDataURL(`image/${format}`, 0.9);
  m.redraw();
};

const downloadSpritesheet = (state: State): void => {
  if (!state.spritesheet) return;

  const a = document.createElement("a");
  a.href = state.spritesheet;
  const format =
    state.exportFormat === "webp" && state.canvas && state.canvas.width > 16383
      ? "png"
      : state.exportFormat;
  a.download = `${state.exportName}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const copyPositions = (state: State): void => {
  if (state.sortedImages.length === 0) return;

  const positions = [
    ...state.sortedImages.map((img) => `${img.startX}`),
    state.canvas?.width,
  ].join(", ");
  navigator.clipboard
    .writeText(`[${positions}]`)
    .then(() => alert("Positions copied to clipboard"))
    .catch((err) => console.error("Failed to copy positions:", err));
};

const toPascalCase = (str: string): string => {
  return str.replace(/([-_][a-z])/gi, ($1) =>
    $1.toUpperCase().replace("-", "").replace("_", "")
  );
};

const generateCode = (state: State, includeHelperCode = true): string => {
  if (state.sortedImages.length === 0) return "";

  const pascalCaseName = toPascalCase(state.exportName);

  const helperCode = `export interface Sprite {
  label: string;
  img: string;
  height: number;
  top?: number;
  left: number[];
}

export const transpImg = (
  img: string,
  label: string,
  width: number,
  height: number,
  offset: number,
  top = 0,
  id = ""
) =>
  \`<div class="sprite-wrapper"><div class="sprite" role="img" aria-label='\${label}' id='\{id}' style='height:\${height}px;width:\${width}px;background:url(\${img}) no-repeat -$\{offset}px -${top}px'></div></div>\`;

/** Sprite image generator, optionally provide the index of the image. */
export const imageGen =
  (sprite: Sprite) =>
  (index?: number, realHeight = 0) => {
    const { height, top = 0, left, img, label = 'sprite' } = sprite;
    const count = left.length - 1;
    if (typeof index === 'undefined') index = random(0, count - 1);
    const i = index % count;
    const width = left[i + 1] - left[i];
    return transpImg(img, \`\${label}\`, width, realHeight || height, left[i], top, \`imgId\${index}\`);
  };
  
`;

  const spriteData = `
const ${pascalCaseName}Sprite: Sprite = {
  label: '${state.exportName.replace(/[-_]/g, " ")}',
  img: '${state.exportName}.${state.exportFormat}',
  height: ${state.canvas?.height || 0},
  top: 0,
  left: [
${state.sortedImages.map((img) => `    ${Math.round(img.startX)},`).join("\n")}
    ${state.canvas?.width ? Math.round(state.canvas.width) : 0}
  ],
};
const ${pascalCaseName}ImageGen = imageGen(${pascalCaseName}Sprite);`;

  return `${includeHelperCode ? helperCode : ""}// Spritesheet positions for ${
    state.exportName
  }.${state.exportFormat}
${spriteData}

// Example usage:
// const imageHtml = ${pascalCaseName}ImageGen(0); // First image
// const imageHtml = ${pascalCaseName}ImageGen(1); // Second image
`;
};

const generateAlternativeCode = (state: State): string => {
  if (state.sortedImages.length === 0) return "";

  return `// Spritesheet positions for ${state.exportName}.${state.exportFormat}
const spritePositions = {
${state.sortedImages
  .map(
    (img, index) =>
      `  "${img.name}": { startX: ${img.startX}, width: ${
        img.width * (state.scale / 100)
      }, height: ${img.height * (state.scale / 100)} }`
  )
  .join(",\n")}
};

// CSS usage example:
// .sprite-${state.exportName}-item1 {
//   background: url('${state.exportName}.${state.exportFormat}') no-repeat;
//   background-position: -${state.sortedImages[0]?.startX || 0}px 0;
//   width: ${state.sortedImages[0]?.width * (state.scale / 100) || 0}px;
//   height: ${state.sortedImages[0]?.height * (state.scale / 100) || 0}px;
// }
`;
};

const copyCode = (code: string): void => {
  navigator.clipboard
    .writeText(code)
    .then(() => alert("Code copied to clipboard"))
    .catch((err) => console.error("Failed to copy code:", err));
};

// Component
const SpritesheetGenerator: m.Component = {
  oninit: (vnode) => {
    const state: State = {
      images: [],
      sortedImages: [],
      exportName: "spritesheet",
      exportFormat: "webp",
      scale: 100,
      dragging: false,
      canvas: null,
      spritesheet: null,
    };
    (vnode.state as any).state = state;
  },

  oncreate: (vnode) => {
    const state = (vnode.state as any).state as State;
    state.canvas = document.getElementById("drop-zone") as HTMLCanvasElement; // Get the canvas by its ID

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      state.dragging = false;
      if (!e.dataTransfer?.files) return;
      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      if (files.length === 0) return;
      const newImages: ImageInfo[] = [];
      for (const file of files) {
        try {
          const img = await loadImage(file);
          newImages.push({
            file,
            img,
            name: file.name.replace(/\.[^/.]+$/, ""),
            startX: 0,
            originalHeight: img.height,
            originalWidth: img.width,
            height: Math.round(img.height * (state.scale / 100)),
            width: Math.round(img.width * (state.scale / 100)),
            loaded: true,
          });
        } catch (error) {
          console.error(`Failed to load image ${file.name}:`, error);
        }
      }
      state.images = [...state.images, ...newImages];
      state.sortedImages = [...state.images].sort((a, b) =>
        naturalSort(a.name, b.name)
      );
      drawSpritesheet(state);
    };

    const canvasElement = document.getElementById("drop-zone");
    if (canvasElement) {
      canvasElement.addEventListener("dragover", (e) => {
        e.preventDefault();
        state.dragging = true;
        m.redraw();
      });

      canvasElement.addEventListener("dragleave", (e) => {
        e.preventDefault();
        state.dragging = false;
        m.redraw();
      });

      canvasElement.addEventListener("drop", handleDrop);
    }

    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const files = Array.from(
          (e.target as HTMLInputElement).files || []
        ).filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) return;
        const newImages: ImageInfo[] = [];
        for (const file of files) {
          try {
            const img = await loadImage(file);
            newImages.push({
              file,
              img,
              name: file.name.replace(/\.[^/.]+$/, ""),
              startX: 0,
              originalHeight: img.height,
              originalWidth: img.width,
              height: Math.round(img.height * (state.scale / 100)),
              width: Math.round(img.width * (state.scale / 100)),
              loaded: true,
            });
          } catch (error) {
            console.error(`Failed to load image ${file.name}:`, error);
          }
        }
        state.images = [...state.images, ...newImages];
        state.sortedImages = [...state.images].sort((a, b) =>
          naturalSort(a.name, b.name)
        );
        drawSpritesheet(state);
      });
    }
  },

  view: (vnode) => {
    const state = (vnode.state as any).state as State;
    const scaledCanvasWidth = state.canvas ? state.canvas.width : 0;
    const scaledCanvasHeight = state.canvas ? state.canvas.height : 0;
    const canExportWebp = scaledCanvasWidth <= 16383;

    return m(".spritesheet-generator", [
      m("h1", "Spritesheet Generator"),
      m(
        ".drop-zone-container", // Container for scrolling
        {
          style: { "overflow-x": "auto", marginBottom: "1.5rem" },
        },
        state.images.length === 0 &&
          m(".drop-message", "Drag and drop images here or click to browse"),
        m(
          "canvas#drop-zone", // The drop zone is now the canvas
          {
            class: state.dragging ? "dragging" : "",
            style: {
              width: `${scaledCanvasWidth}px`,
              height: `${scaledCanvasHeight}px`,
              border: "3px dashed #ccc",
              backgroundColor:
                state.images.length === 0 ? "#f7f7f7" : "transparent",
              cursor: "pointer",
              minWidth: state.images.length === 0 ? "100%" : undefined, // Set a minimum width
              borderRadius: "10px",
              /* Add flex properties to center text */
              display: state.images.length === 0 ? "flex" : "block",
              justifyContent:
                state.images.length === 0 ? "center" : "flex-start",
              alignItems: state.images.length === 0 ? "center" : "flex-start",
            },
            onclick: () => {
              document.getElementById("file-input")?.click();
            },
          }
          // The drop message is no longer directly inside the canvas tag in the view
        )
      ),
      state.images.length > 0 &&
        m(
          ".image-count",
          `${state.images.length} images loaded, output size ${Math.round(
            scaledCanvasWidth
          )} x ${Math.round(scaledCanvasHeight)} px`
        ),

      m("input#file-input[type=file][multiple][accept=image/*]", {
        style: "display: none;",
      }),

      m(".options", [
        // Options are now always rendered
        m(".form-group", [
          m("label", "Export name:"),
          m("input[type=text]", {
            value: state.exportName,
            oninput: (e: InputEvent) => {
              state.exportName = (e.target as HTMLInputElement).value;
            },
          }),
        ]),

        m(".form-group", [
          m("label", "Export format:"),
          m(
            "select",
            {
              value: state.exportFormat,
              onchange: (e: Event) => {
                state.exportFormat = (e.target as HTMLSelectElement)
                  .value as any;
                drawSpritesheet(state);
              },
            },
            [
              m("option", { value: "webp", disabled: !canExportWebp }, "WebP"),
              m("option", { value: "png" }, "PNG"),
              m("option", { value: "jpg" }, "JPEG"),
            ]
          ),
          !canExportWebp &&
            m(
              ".format-warning",
              "WebP export disabled due to exceeding maximum width of 16383px."
            ),
        ]),

        m(".form-group", [
          m("label", `Scale: ${state.scale}%`),
          m("input[type=range]", {
            min: 10,
            max: 200,
            step: 1,
            value: state.scale,
            oninput: (e: InputEvent) => {
              state.scale = parseInt((e.target as HTMLInputElement).value);
              state.sortedImages.forEach((img) => {
                img.width =
                  state.scale === 100
                    ? img.originalWidth
                    : Math.round(img.originalWidth * (state.scale / 100));
                img.height =
                  state.scale === 100
                    ? img.originalHeight
                    : Math.round(img.originalHeight * (state.scale / 100));
              });
              drawSpritesheet(state);
            },
          }),
          m(
            "label",
            { style: { width: "75px", marginLeft: "20px" } },
            "Height:"
          ),
          m("input[type=number]", {
            style: { width: "125px", flex: "unset" },
            value: state.canvas?.height,
            onblur: (e: InputEvent) => {
              try {
                const actualHeight = state.sortedImages.reduce(
                  (acc, cur) => Math.max(acc, cur.originalHeight),
                  0
                );
                const desiredHeight = parseInt(
                  (e.target as HTMLInputElement).value
                );
                state.scale = +((100 * desiredHeight) / actualHeight).toFixed(
                  1
                );
                state.sortedImages.forEach((img) => {
                  img.width =
                    state.scale === 100
                      ? img.originalWidth
                      : Math.round(img.originalWidth * (state.scale / 100));
                  img.height =
                    state.scale === 100
                      ? img.originalHeight
                      : Math.round(img.originalHeight * (state.scale / 100));
                });
                drawSpritesheet(state);
              } catch (e: any) {
                console.error(e);
              }
            },
          }),
        ]),

        m(".button-group", [
          m(
            "button.primary",
            {
              onclick: () => downloadSpritesheet(state),
              disabled: !state.spritesheet,
            },
            "Export Spritesheet"
          ),

          m(
            "button",
            {
              onclick: () => copyPositions(state),
              disabled: state.sortedImages.length === 0,
            },
            "Copy Positions"
          ),

          m(
            "button",
            {
              onclick: () => {
                copyCode(generateCode(state, false));
              },
              disabled: state.sortedImages.length === 0,
            },
            "Copy Code"
          ),

          m(
            "button",
            {
              onclick: () => {
                copyCode(generateAlternativeCode(state));
              },
              disabled: state.sortedImages.length === 0,
            },
            "Copy Alt Code"
          ),

          m(
            "button.danger",
            {
              onclick: () => {
                state.images = [];
                state.sortedImages = [];
                state.spritesheet = null;
                if (state.canvas) {
                  const ctx = state.canvas.getContext("2d");
                  ctx?.clearRect(0, 0, state.canvas.width, state.canvas.height);
                }
              },
              disabled: state.images.length === 0,
            },
            "Clear All"
          ),
        ]),
      ]),

      state.images.length > 0 && [
        m("h2", "Code Preview"),
        m("pre.code-preview", generateCode(state)),

        m("h2", "Alternative Code Preview"),
        m("pre.code-preview", generateAlternativeCode(state)),
      ],
    ]);
  },
};

// Mount the app
m.mount(document.body, SpritesheetGenerator);
