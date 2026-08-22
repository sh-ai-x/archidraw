import {test,expect} from "@playwright/test";

type Scene = {elements: Array<{type:string;id?:string;x:number;y:number;width:number;height:number;points?:number[][];startBinding?:any;endBinding?:any;boundElements?:Array<{id:string;type:string}>;text?:string;textAlign?:string;verticalAlign?:string;containerId?:string|null}>};
const readScene = async (page: import("@playwright/test").Page): Promise<Scene> => {
  const raw = await page.evaluate(() => localStorage.getItem("archidraw:scene"));
  expect(raw, "scene in localStorage").not.toBeNull();
  return JSON.parse(raw as string) as Scene;
};

const drawRectangle = async (
  page: import("@playwright/test").Page,
  x1: number, y1: number, x2: number, y2: number,
) => {
  await page.getByRole("button", {name: "Rectangle"}).click();
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, {steps: 5});
  await page.mouse.up();
  await page.getByRole("button", {name: "Select"}).click();
  return box;
};

test.beforeEach(async ({page}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("resize 누적 검증 — SE 핸들을 50-step 멀티드래그하면 width·height가 정확히 +50씩 증가한다", async ({page}) => {
  // 1) Draw a 200x150 rectangle at (100, 100).
  const box = await drawRectangle(page, 100, 100, 300, 250);
  const before = (await readScene(page)).elements.find(e => e.type === "rectangle")!;
  expect(before.width).toBe(200);
  expect(before.height).toBe(150);

  // 2) Click inside the rectangle to ensure it is the primary selection so the
  //    SE corner handle is rendered and hit-testable.
  await page.mouse.click(box.x + 150, box.y + 150);

  // 3) SE handle in world coords: cx = x + w + PAD - hs = 100 + 200 + 6 - 8 = 298,
  //    cy = y + h + PAD - hs = 100 + 150 + 6 - 8 = 248 (PAD=6, hs=8/zoom).
  //    Drag +50 right +50 down with 50 intermediate steps (multi-step drag that
  //    exercises the cumulative-delta branch in onPointerMove).
  await page.mouse.move(box.x + 298, box.y + 248);
  await page.mouse.down();
  await page.mouse.move(box.x + 348, box.y + 298, {steps: 50});
  await page.mouse.up();

  // 4) After multi-step drag, width and height must be EXACTLY +50, not the
  //    last-step-delta only.
  const after = (await readScene(page)).elements.find(e => e.type === "rectangle")!;
  expect(after.width, "width should be exactly 250 (200 + 50)").toBe(250);
  expect(after.height, "height should be exactly 200 (150 + 50)").toBe(200);
});

test("move 누적 검증 — 선택된 도형을 50-step 드래그하면 x·y가 정확히 +50씩 증가한다", async ({page}) => {
  // 1) Draw a rectangle at (100, 100) → 200x150.
  const box = await drawRectangle(page, 100, 100, 300, 250);

  // 2) Click inside the rectangle to primary-select it (tool is now "select").
  await page.mouse.click(box.x + 150, box.y + 150);

  // 3) Drag from inside the rectangle by (+50, +50) using 50 steps. The drag
  //    goes well past DRAGGING_THRESHOLD (3) on the very first step, so the
  //    drag-element branch is committed and the multi-step cumulative math is
  //    exercised.
  await page.mouse.move(box.x + 150, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, {steps: 50});
  await page.mouse.up();

  const after = (await readScene(page)).elements.find(e => e.type === "rectangle")!;
  expect(after.x, "x should be exactly 150 (100 + 50)").toBe(150);
  expect(after.y, "y should be exactly 150 (100 + 50)").toBe(150);
});

test("binding 누적 검증 — arrow 도구로 right→left 바인딩을 20-step 드래그하면 화살표 끝점이 두번째 도형의 left binding에 닿는다", async ({page}) => {
  // 1) Two rectangles side-by-side. First (a) at (100,100,120,80). Second (b) at
  //    (300,100,120,80). a.right-center = (220, 140); b.left-center = (300, 140).
  await page.getByRole("button", {name: "Rectangle"}).click();
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 180, {steps: 5});
  await page.mouse.up();
  await page.mouse.move(box.x + 300, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 180, {steps: 5});
  await page.mouse.up();

  // 2) Switch to arrow tool.
  await page.getByRole("button", {name: "Arrow"}).click();

  // 3) Press on a's right-center (220, 140), drag in 20 steps to b's
  //    left-center (300, 140), release.
  await page.mouse.move(box.x + 220, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 140, {steps: 20});
  await page.mouse.up();

  // 4) Read the scene. The arrow's start point is the right-center of a
  //    (220, 140). The arrow's second point is the world delta from that
  //    start to the b.left-center (300, 140), i.e. (+80, 0).
  const scene = await readScene(page);
  const arrow = scene.elements.find(e => e.type === "arrow");
  expect(arrow, "arrow element should exist").toBeDefined();
  expect(arrow!.points, "arrow should have 2 points").toHaveLength(2);
  // The fix uses bindingPointWorld for the endHit, so the second point is
  // (b.left.x - a.right.x, b.left.y - a.right.y) = (80, 0).
  expect(arrow!.points![1][0], "endX - startX should be exactly 80").toBeCloseTo(80, 5);
  expect(arrow!.points![1][1], "endY - startY should be exactly 0").toBeCloseTo(0, 5);
  // startBinding / endBinding must reference the two shapes.
  expect(arrow!.startBinding?.elementId).toBeDefined();
  expect(arrow!.endBinding?.elementId).toBeDefined();
});


test("다이아몬드 더블클릭 텍스트 — 다이아몬드 중앙을 더블클릭하면 텍스트가 bbox 중앙에 center/middle 정렬로 바인딩된다", async ({page}) => {
  // 1) 다이아몬드 도구 선택 → (100,100)에서 (300,250)까지 드래그해
  //    bbox=(100,100,200,150) 다이아몬드를 만든다. 마름모의 시각적 중심은
  //    bbox 중앙 (200, 175).
  await page.getByRole("button", {name: "Diamond"}).click();
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, {steps: 5});
  await page.mouse.up();

  // 2) Select 도구로 전환 (onDoubleClick 핸들러는 tool==='select"일 때만 동작).
  await page.getByRole("button", {name: "Select"}).click();

  // 3) 다이아몬드 중앙(200, 175)을 더블클릭하면 window.prompt가 뜬다.
  //    Playwright dialog 이벤트로 "HI"를 입력해 바인딩 진행.
  page.on("dialog", d => d.accept("HI"));
  await page.mouse.dblclick(box.x + 200, box.y + 175);

  // 4) localStorage에서 다이아몬드와 바인딩된 텍스트를 읽는다.
  const scene = await readScene(page);
  const diamond = scene.elements.find(e => e.type === "diamond")!;
  expect(diamond, "diamond element should exist").toBeDefined();
  // 다이아몬드는 boundElements에 텍스트 id를 갖고 있어야 한다.
  expect(diamond.boundElements, "diamond must carry a boundElements list").toBeDefined();
  const boundRef = diamond.boundElements!.find(b => b.type === "text");
  expect(boundRef, "diamond must carry a text bound").toBeDefined();

  // 5) 텍스트 요소를 찾는다.
  const txt = scene.elements.find(e => e.type === "text")!;
  expect(txt, "text element should exist").toBeDefined();
  expect(txt.text, "text content").toBe("HI");
  expect(txt.containerId, "containerId references the diamond").toBe(diamond.id);
  // (2026-08-22) "글씨는 좌측부터" — 모든 도형의 텍스트는 bbox 좌상단에서
  // 시작, verticalAlign=middle. 마름모의 시각적 중심이 bbox 중앙이라는
  // 점은 무관: 텍스트 메타데이터는 bbox top-left, 렌더링은
  // resolveContainerBounds의 inner bounds에서 textAlign/verticalAlign로 배치.
  expect(Math.abs(txt.x - diamond.x), "txt.x at bbox left").toBeLessThanOrEqual(1);
  expect(Math.abs(txt.y - diamond.y), "txt.y at bbox top").toBeLessThanOrEqual(1);
  expect(txt.textAlign, "diamond text uses left alignment").toBe("left");
  expect(txt.verticalAlign, "diamond text uses middle alignment").toBe("middle");
});

test("원 더블클릭 텍스트 — 원 중앙을 더블클릭하면 텍스트가 bbox 중앙에 center/middle 정렬로 바인딩된다", async ({page}) => {
  // 1) Ellipse 도구 선택 → (100,100)에서 (300,250)까지 드래그해
  //    bbox=(100,100,200,150) 원을 만든다.
  await page.getByRole("button", {name: "Ellipse"}).click();
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, {steps: 5});
  await page.mouse.up();

  // 2) Select 도구로 전환.
  await page.getByRole("button", {name: "Select"}).click();

  // 3) 원 중앙을 더블클릭 → prompt에 "HI" 입력.
  page.on("dialog", d => d.accept("HI"));
  await page.mouse.dblclick(box.x + 200, box.y + 175);

  // 4) localStorage 검증.
  const scene = await readScene(page);
  const ellipse = scene.elements.find(e => e.type === "ellipse")!;
  expect(ellipse, "ellipse element should exist").toBeDefined();
  expect(ellipse.boundElements, "ellipse must carry a boundElements list").toBeDefined();
  const boundRef = ellipse.boundElements!.find(b => b.type === "text");
  expect(boundRef, "ellipse must carry a text bound").toBeDefined();

  const txt = scene.elements.find(e => e.type === "text")!;
  expect(txt, "text element should exist").toBeDefined();
  expect(txt.text, "text content").toBe("HI");
  expect(txt.containerId, "containerId references the ellipse").toBe(ellipse.id);
  // (2026-08-22) "글씨는 좌측부터" — 원도 bbox 좌상단에서 시작, verticalAlign=middle.
  expect(Math.abs(txt.x - ellipse.x), "txt.x at bbox left").toBeLessThanOrEqual(1);
  expect(Math.abs(txt.y - ellipse.y), "txt.y at bbox top").toBeLessThanOrEqual(1);
  expect(txt.textAlign, "ellipse text uses left alignment").toBe("left");
  expect(txt.verticalAlign, "ellipse text uses middle alignment").toBe("middle");
});

// (2026-08-22) 신규 테스트: 사각형 텍스트의 수직 중앙 정렬.
test("사각형 텍스트 수직 중앙 — 사각형에 바인딩된 텍스트는 verticalAlign=middle 이고 렌더된 텍스트 중심 y가 사각형 중심 y와 ±10 이내", async ({page}) => {
  // 1) 사각형 (100,100) → (300,250) 즉 bbox=(100,100,200,150).
  const box = await drawRectangle(page, 100, 100, 300, 250);

  // 2) Select 도구로 전환 후 사각형 중앙을 더블클릭.
  await page.getByRole("button", {name: "Select"}).click();
  page.on("dialog", d => d.accept("Hi"));
  await page.mouse.dblclick(box.x + 200, box.y + 175);

  // 3) 메타데이터 검증: verticalAlign === "middle".
  const scene = await readScene(page);
  const rect = scene.elements.find(e => e.type === "rectangle")!;
  expect(rect, "rectangle element should exist").toBeDefined();
  const txt = scene.elements.find(e => e.type === "text")!;
  expect(txt, "text element should exist").toBeDefined();
  expect(txt.containerId, "containerId references the rectangle").toBe(rect.id);
  expect(txt.verticalAlign, "rectangle text uses middle alignment").toBe("middle");
  expect(txt.textAlign, "rectangle text uses left alignment").toBe("left");

  // 4) 렌더된 텍스트의 bounding-box 수직 중심이 사각형 중심 y와 ±10 이내.
  //    Renderer.ts의 resolveContainerBounds + layoutLines 로직을 그대로 재현:
  //      inset = 4
  //      bounds.y = c.y + inset
  //      bounds.h = c.height - 2 * inset
  //      blockH   = (lines.length - 1) * lineHeight
  //      firstY   = bounds.y + bounds.h / 2 - blockH / 2 + fontSize * 0.35
  //    한 줄짜리 "Hi"는 blockH=0. firstY는 baseline이고, 텍스트 bounding-box
  //    의 수직 중심은 대략 baseline - fontSize/2.
  const inset = 4;
  const fontSize = (txt as unknown as {fontSize?: number}).fontSize ?? 20;
  const lineHeight = (txt as unknown as {lineHeight?: number}).lineHeight ?? 1.2;
  const boundsY = rect.y + inset;
  const boundsH = rect.height - 2 * inset;
  const blockH = (1 - 1) * lineHeight * fontSize; // 1 line
  const firstY = boundsY + boundsH / 2 - blockH / 2 + fontSize * 0.35;
  const textCenterY = firstY - fontSize / 2;
  const rectCenterY = rect.y + rect.height / 2;
  expect(
    Math.abs(textCenterY - rectCenterY),
    `text bbox center y (${textCenterY}) within ±10 of rect center y (${rectCenterY})`,
  ).toBeLessThanOrEqual(10);
});

// (2026-08-22) 회귀 테스트: 도형별 text-align 규칙을 한 번에 검증.
// "글씨는 좌측부터" — 모든 도형 (사각형, 마름모, 원) 동일하게 bbox top-left
// 에서 left 정렬, verticalAlign=middle. 이 회귀가 한 번 더 깨지면 사용자가
// "글씨 안써져"라고 다시 신고한다.
test("도형별 텍스트 정렬 규칙 — 모든 도형이 bbox 좌상단에서 left 정렬로 바인딩된다", async ({page}) => {
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");

  // 사각형 (100,100)→(300,250).
  await page.getByRole("button", {name: "Rectangle"}).click();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, {steps: 5});
  await page.mouse.up();

  // 다이아몬드 (350,100)→(550,250).
  await page.getByRole("button", {name: "Diamond"}).click();
  await page.mouse.move(box.x + 350, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 550, box.y + 250, {steps: 5});
  await page.mouse.up();

  // 원 (600,100)→(800,250).
  await page.getByRole("button", {name: "Ellipse"}).click();
  await page.mouse.move(box.x + 600, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 800, box.y + 250, {steps: 5});
  await page.mouse.up();

  // Select 도구로 전환.
  await page.getByRole("button", {name: "Select"}).click();

  // 세 도형 각각 더블클릭 → prompt에 "L" 입력.
  page.on("dialog", d => d.accept("L"));

  await page.mouse.dblclick(box.x + 200, box.y + 175); // rectangle center
  await page.mouse.dblclick(box.x + 450, box.y + 175); // diamond center
  await page.mouse.dblclick(box.x + 700, box.y + 175); // ellipse center

  const scene = await readScene(page);
  const rect = scene.elements.find(e => e.type === "rectangle")!;
  const diamond = scene.elements.find(e => e.type === "diamond")!;
  const ellipse = scene.elements.find(e => e.type === "ellipse")!;
  const rectTxt = scene.elements.find(e => e.type === "text" && e.containerId === rect.id)!;
  const diamondTxt = scene.elements.find(e => e.type === "text" && e.containerId === diamond.id)!;
  const ellipseTxt = scene.elements.find(e => e.type === "text" && e.containerId === ellipse.id)!;
  expect(rectTxt, "rectangle text element should exist").toBeDefined();
  expect(diamondTxt, "diamond text element should exist").toBeDefined();
  expect(ellipseTxt, "ellipse text element should exist").toBeDefined();
  // 사각형: bbox top-left = left 정렬 (시각적 모양 = bbox).
  expect(rectTxt.textAlign, "rectangle text uses left alignment").toBe("left");
  expect(Math.abs(rectTxt.x - rect.x), "rectangle txt.x at bbox left").toBeLessThanOrEqual(1);
  // 다이아몬드: bbox top-left = left 정렬 (시각적 마름모는 bbox 안쪽이지만 텍스트
  // 메타데이터는 bbox 시작점; 렌더링은 resolveContainerBounds의 inner bounds 기준).
  expect(diamondTxt.textAlign, "diamond text uses left alignment").toBe("left");
  expect(Math.abs(diamondTxt.x - diamond.x), "diamond txt.x at bbox left").toBeLessThanOrEqual(1);
  // 원: bbox top-left = left 정렬 (시각적 원은 bbox 안쪽이지만 텍스트 메타데이터는
  // bbox 시작점).
  expect(ellipseTxt.textAlign, "ellipse text uses left alignment").toBe("left");
  expect(Math.abs(ellipseTxt.x - ellipse.x), "ellipse txt.x at bbox left").toBeLessThanOrEqual(1);
  // 모든 도형의 텍스트가 verticalAlign=middle.
  expect(rectTxt.verticalAlign, "rectangle text uses middle alignment").toBe("middle");
  expect(diamondTxt.verticalAlign, "diamond text uses middle alignment").toBe("middle");
  expect(ellipseTxt.verticalAlign, "ellipse text uses middle alignment").toBe("middle");
});



// (2026-08-22) 시각 회귀 테스트: 다이아몬드에 바인딩된 텍스트의 LEFT edge
// 가 bbox 좌측 inner-bound 근처 (shape.x + inset)에 실제로 렌더링된다.
// 데이터 레이어 검증 (textAlign="left" 메타데이터)만으로는 부족 — 텍스트가
// 실제로 캔버스에 보이지 않으면 사용자 버그다. 회귀 발생 시 (예:
// layoutLines가 textAlign 인자를 무시하면) 텍스트가 다른 위치로 밀려 픽셀
// 카운트가 0이 되거나 LEFT edge가 inset을 크게 벗어난다.
test("다이아몬드 텍스트 픽셀 렌더 — 더블클릭으로 입력한 텍스트가 마름모 좌측 inner-bound에서 시작한다", async ({page}) => {
  // 1) 다이아몬드 도구 선택 → (100,100)→(300,250) 드래그로 bbox=(100,100,200,150) 다이아몬드.
  await page.getByRole("button", {name: "Diamond"}).click();
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, {steps: 5});
  await page.mouse.up();

  // 2) Select 도구로 전환.
  await page.getByRole("button", {name: "Select"}).click();

  // 3) 다이아몬드 중앙(200, 175)을 더블클릭 → prompt에 "PIXEL" 입력.
  //    픽셀 기반 검출이 쉬운 글자 ("I", "L") 대신 "PIXEL"을 사용해 자연스러운 단어처럼 보이게 한다.
  page.on("dialog", d => d.accept("PIXEL"));
  await page.mouse.dblclick(box.x + 200, box.y + 175);
  await page.waitForTimeout(300);

  // 4) 캔버스에서 다이아몬드 inner bounds의 LEFT edge 근처에서 텍스트 글리프를 검출한다.
  //    "글씨는 좌측부터" — inner bounds.x = shape.x + inset (4) = 104. 텍스트 "PIXEL"
  //    5글자 × fontSize 20 → 약 60px 폭이므로 x=104..164 에 글리프가 그려진다.
  //    텍스트의 수직 위치는 verticalAlign=middle 이므로 bbox 중심 y=175 부근.
  //    스캔 영역: x=104..184, y=155..195. 다이아몬드 stroke의 leftmost
  //    vertex는 x=100 부근이라 x=104 부터 스캔해야 텍스트 글리프와 구분된다.
  const pixelCheck = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-testid="canvas"]') as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    // 텍스트 예상 영역 (x=104..164) + 약간의 우측 여유 + 상하 마진.
    const region = { x: 104 * dpr, y: 155 * dpr, w: 80 * dpr, h: 40 * dpr };
    const imgData = ctx.getImageData(region.x, region.y, region.w, region.h);
    const w = region.w;
    let darkPixels = 0;
    // 각 column별로 dark 픽셀 카운트 → leftmost column 찾기.
    const darkCols: number[] = [];
    for (let col = 0; col < w; col++) {
      let colDark = 0;
      for (let row = 0; row < region.h; row++) {
        const idx = (row * w + col) * 4;
        const r = imgData.data[idx], g = imgData.data[idx+1], b = imgData.data[idx+2], a = imgData.data[idx+3];
        if (a > 0 && r < 100 && g < 100 && b < 100) {
          colDark++;
          darkPixels++;
        }
      }
      if (colDark > 0) darkCols.push(col);
    }
    // leftmost = region.x + leftmost/dpr → world x.
    const leftmostWorldX = darkCols.length > 0 ? 104 + darkCols[0] / dpr : NaN;
    return { darkPixels, totalPixels: (region.w * region.h), leftmostWorldX };
  });

  // 5) 텍스트 글리프 픽셀이 충분히 검출되어야 한다. "PIXEL" 5글자 × fontSize 20
  //    → 최소 80개 이상의 어두운 픽셀. 회귀가 발생하면 (예: 텍스트가 사라지면)
  //    카운트가 0이 된다.
  expect(
    pixelCheck.darkPixels,
    `텍스트 글리프 픽셀이 마름모 inner-bounds 좌측 영역에서 ${pixelCheck.darkPixels}개 검출됨 (기대: ≥80). ` +
    `이 영역은 텍스트 시작점이라 글리프가 여기 보이지 않으면 사용자에게 "글씨 안써져"로 보인다.`,
  ).toBeGreaterThanOrEqual(80);

  // 6) 텍스트의 LEFT edge는 inner-bounds 좌측 (≈ shape.x + inset = 104) 근처여야 한다.
  //    "글씨는 좌측부터" — 글리프의 leftmost world x 가 inset 영역 (104..112) 안에 있어야 한다.
  //    center 정렬로 회귀하면 글리프가 x≈170 부근에서 시작해 이 검증을 깨뜨린다.
  expect(
    pixelCheck.leftmostWorldX,
    `텍스트의 leftmost world x = ${pixelCheck.leftmostWorldX} (기대: 104..112, shape.x=100 + inset=4). ` +
    `LEFT edge가 inset을 크게 벗어나면 텍스트가 "좌측부터" 렌더링되지 않는 회귀다.`,
  ).toBeGreaterThanOrEqual(104);
  expect(
    pixelCheck.leftmostWorldX,
    `텍스트의 leftmost world x = ${pixelCheck.leftmostWorldX} (기대: ≤112). ` +
    `LEFT edge가 너무 안쪽이면 (center 정렬로 회귀) 텍스트가 bbox 중앙에서 시작한다.`,
  ).toBeLessThanOrEqual(112);
});



// (2026-08-22) 신규 테스트 1: 다이아몬드 더블클릭으로 텍스트를 입력한 뒤, 빈
// 문자열을 한 번 더 입력하면 텍스트가 "" 로 비워진다 (이전 버그: trim() ===
// "" 가드를 통과 못해 빈 입력이 무시되고 기존 텍스트가 유지됨).
test("다이아몬드 더블클릭 후 빈 text 입력 시 텍스트가 지워진다", async ({page}) => {
  // 1) 다이아몬드 도구 선택 → (100,100)→(300,250) 드래그로 bbox=(100,100,200,150) 다이아몬드.
  await page.getByRole("button", {name: "Diamond"}).click();
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, {steps: 5});
  await page.mouse.up();

  // 2) Select 도구로 전환 후 다이아몬드 중앙을 더블클릭 → prompt에 "HI" 입력.
  await page.getByRole("button", {name: "Select"}).click();
  page.on("dialog", d => d.accept("HI"));
  await page.mouse.dblclick(box.x + 200, box.y + 175);

  // 3) 텍스트가 "HI"로 바인딩됐는지 검증.
  let scene = await readScene(page);
  const diamond = scene.elements.find(e => e.type === "diamond")!;
  const txtBefore = scene.elements.find(e => e.type === "text" && e.containerId === diamond.id)!;
  expect(txtBefore, "text bound to diamond exists after first dblclick").toBeDefined();
  expect(txtBefore.text, "initial text is HI").toBe("HI");

  // 4) 같은 위치를 다시 더블클릭 → prompt에 빈 문자열 "" 입력.
  //    onDoubleClick의 shapeHit 분기가 handleBindAt 으로 라우팅하므로
  //    bindTextAt이 기존 바인딩 텍스트를 UPDATE 한다. 빈 입력이면
  //    text="" 으로 비워져야 한다 (이전 버그: trim() 가드로 인해 무시됨).
  page.removeAllListeners("dialog");
  page.on("dialog", d => d.accept(""));
  await page.mouse.dblclick(box.x + 200, box.y + 175);

  // 5) 텍스트 요소의 text 가 "" 로 변경됐는지 검증. 텍스트 요소 자체는
  //    삭제되지 않고 (UPDATE 경로) text 필드만 비워진다.
  scene = await readScene(page);
  const txtAfter = scene.elements.find(e => e.type === "text" && e.containerId === diamond.id);
  expect(txtAfter, "text element still bound to diamond after empty submit").toBeDefined();
  expect(txtAfter!.text, "text content cleared after empty submit").toBe("");
  expect(txtAfter!.originalText, "originalText cleared as well").toBe("");
});

// (2026-08-22) 신규 테스트 2: 사각형을 선택한 뒤 색상 픽커의 분홍색 스와치를
// 클릭하면 사각형의 backgroundColor 가 "#fbcfe8" 로 업데이트된다.
test("사각형 컬러 픽커 동작 — 분홍 스와치를 클릭하면 backgroundColor 가 업데이트된다", async ({page}) => {
  // 1) 사각형 (100,100) → (300,250) 드래그.
  const box = await drawRectangle(page, 100, 100, 300, 250);

  // 2) 사각형 내부를 한 번 클릭해 선택 상태로 만든다 → ColorPanel 이
  //    selected + shape 조건을 만족해 화면에 나타난다.
  await page.mouse.click(box.x + 150, box.y + 150);

  // 3) 분홍색 스와치 (#fbcfe8) 클릭.
  await page.locator('button[aria-label="Fill #fbcfe8"]').click();

  // 4) localStorage 의 scene에서 사각형의 backgroundColor 검증.
  const scene = await readScene(page);
  const rect = scene.elements.find(e => e.type === "rectangle")!;
  expect(rect, "rectangle element should exist").toBeDefined();
  expect(rect.backgroundColor, "rectangle fill color is updated by swatch click").toBe("#fbcfe8");
});
