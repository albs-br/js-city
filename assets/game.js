// === Game state ===
const canvas = document.querySelector('#city');
const ctx = canvas.getContext('2d');
const backgroundCanvas = document.createElement('canvas');
const backgroundCtx = backgroundCanvas.getContext('2d');
const cols = 32;
const rows = 24;
const size = 20;
const SAVE_KEY = 'js-city-save-v1';
const grid = Array.from({ length: rows }, () => Array(cols).fill('land'));
let hoverPlacement = null;

backgroundCanvas.width = canvas.width;
backgroundCanvas.height = canvas.height;

let tool = 'road';
let funds = 5000;
let month = 0;
let population = 0;
let timeSpeed = 'paused';
let timeAccumulator = 0;
let lastFrameTime = 0;

// === Pricing and tile metadata ===
const prices = { road: 10, res: 100, com: 150, ind: 125, park: 50, bulldozer: 5 };
const tileImages = {};
const blockMap = new Map();
const tileSources = {
	land: 'assets/land.svg',
	road: 'assets/road-0.svg',
	'road-0': 'assets/road-0.svg',
	'road-1': 'assets/road-1.svg',
	'road-2': 'assets/road-2.svg',
	'road-3': 'assets/road-3.svg',
	'road-4': 'assets/road-4.svg',
	'road-5': 'assets/road-5.svg',
	'road-6': 'assets/road-6.svg',
	'road-7': 'assets/road-7.svg',
	'road-8': 'assets/road-8.svg',
	'road-9': 'assets/road-9.svg',
	'road-10': 'assets/road-10.svg',
	'road-11': 'assets/road-11.svg',
	'road-12': 'assets/road-12.svg',
	'road-13': 'assets/road-13.svg',
	'road-14': 'assets/road-14.svg',
	'road-15': 'assets/road-15.svg',
	res: 'assets/residential.svg',
	com: 'assets/commercial.svg',
	ind: 'assets/industrial.svg',
	park: 'assets/park.svg'
};

// === Asset loading ===
function loadTiles() {
	const entries = Object.entries(tileSources);

	return Promise.all(
		entries.map(([key, src]) => new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				tileImages[key] = img;
				resolve();
			};
			img.onerror = () => reject(new Error('Failed to load: ' + src));
			img.src = src;
		}))
	);
}

// === Rendering ===
function getRoadConnections(x, y) {
	let bits = 0;
	if (y > 0 && grid[y - 1][x] === 'road') bits |= 1;
	if (x + 1 < cols && grid[y][x + 1] === 'road') bits |= 2;
	if (y + 1 < rows && grid[y + 1][x] === 'road') bits |= 4;
	if (x > 0 && grid[y][x - 1] === 'road') bits |= 8;
	return bits;
}

function getRoadTileKey(x, y) {
	return `road-${getRoadConnections(x, y)}`;
}

function drawRoadTile(x, y) {
	const px = x * size;
	const py = y * size;
	const tileKey = getRoadTileKey(x, y);
	const tile = tileImages[tileKey] || tileImages['road-0'];
	if (tile) {
		ctx.drawImage(tile, px, py, size, size);
	} else {
		ctx.fillStyle = '#76b7a7';
		ctx.fillRect(px, py, size, size);
	}
}

function registerBlock(originX, originY, tileKey) {
	for (let y = originY; y < originY + 3; y++) {
		for (let x = originX; x < originX + 3; x++) {
			blockMap.set(`${x},${y}`, { originX, originY, tileKey });
		}
	}
}

function getPlacementInfo(x, y) {
	const blockTools = ['res', 'com', 'ind'];
	if (blockTools.includes(tool)) {
		const originX = Math.max(0, Math.min(x - 1, cols - 3));
		const originY = Math.max(0, Math.min(y - 1, rows - 3));
		return { x: originX, y: originY, width: 3, height: 3 };
	}

	if (tool === 'bulldozer') {
		const blockInfo = blockMap.get(`${x},${y}`);
		if (blockInfo) {
			return { x: blockInfo.originX, y: blockInfo.originY, width: 3, height: 3 };
		}
	}

	return { x, y, width: 1, height: 1 };
}

function draw() {
	// Clear the visible canvas before rebuilding the city from the current state.
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Visit every grid cell so buildings, roads, land, and grid borders are rendered.
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const px = x * size;
			const py = y * size;
			const blockInfo = blockMap.get(`${x},${y}`);

			// Buildings occupy 3x3 cells, so draw their image only at the block origin.
			if (blockInfo) {
				const tile = tileImages[blockInfo.tileKey];
				const drawX = blockInfo.originX * size;
				const drawY = blockInfo.originY * size;

				if (x === blockInfo.originX && y === blockInfo.originY) {
					if (tile) {
						ctx.drawImage(tile, drawX, drawY, size * 3, size * 3);
					} else {
						ctx.fillStyle = '#76b7a7';
						ctx.fillRect(drawX, drawY, size * 3, size * 3);
					}
					ctx.strokeStyle = '#4a7d77';
					ctx.strokeRect(drawX, drawY, size * 3, size * 3);
				}
				continue;
			}

			// Roads choose their image from the neighboring road connections.
			const tileKey = grid[y][x];

			if (tileKey === 'road') {
				drawRoadTile(x, y);
				ctx.strokeStyle = '#4a7d77';
				ctx.strokeRect(px, py, size, size);
				continue;
			}

			// Draw ordinary tiles, falling back to the land color if an image is unavailable.
			const tile = tileImages[tileKey];
			if (tile) {
				ctx.drawImage(tile, px, py, size, size);
			} else {
				ctx.fillStyle = '#76b7a7';
				ctx.fillRect(px, py, size, size);
			}

			ctx.strokeStyle = '#4a7d77';
			ctx.strokeRect(px, py, size, size);
		}
	}

	// Save the city without its hover overlay so small regions can be restored quickly.
	backgroundCtx.clearRect(0, 0, canvas.width, canvas.height);
	backgroundCtx.drawImage(canvas, 0, 0);
	// Recalculate the hover overlay after the city state has been rebuilt.
	hoverPlacement = null;
	drawHoverPreview();
}

function getHoverPlacement() {
	if (canvas._hoverX == null || canvas._hoverY == null) return null;

	const rect = canvas.getBoundingClientRect();
	const localX = Math.min(Math.max(canvas._hoverX - rect.left, 0), rect.width);
	const localY = Math.min(Math.max(canvas._hoverY - rect.top, 0), rect.height);
	const cellX = Math.floor((localX / rect.width) * cols);
	const cellY = Math.floor((localY / rect.height) * rows);
	const placement = getPlacementInfo(cellX, cellY);
	return {
		x: placement.x * size,
		y: placement.y * size,
		width: placement.width * size,
		height: placement.height * size
	};
}

function drawHoverPreview() {
	// Find the preview for the current mouse position and remember the previous one.
	const nextPlacement = getHoverPlacement();
	const previousPlacement = hoverPlacement;
	// Moving within the same tile or building block does not require any redraw.
	if (previousPlacement && nextPlacement
		&& previousPlacement.x === nextPlacement.x
		&& previousPlacement.y === nextPlacement.y
		&& previousPlacement.width === nextPlacement.width
		&& previousPlacement.height === nextPlacement.height) {
		return;
	}

	// Restore both preview locations so the old overlay cannot leave a trail behind.
	const placements = [previousPlacement, nextPlacement].filter(Boolean);

	if (!placements.length) return;

	const left = Math.min(...placements.map(({ x }) => x));
	const top = Math.min(...placements.map(({ y }) => y));
	const right = Math.max(...placements.map(({ x, width }) => x + width));
	const bottom = Math.max(...placements.map(({ y, height }) => y + height));
	const padding = 2;
	const restoreLeft = Math.max(0, left - padding);
	const restoreTop = Math.max(0, top - padding);
	const restoreRight = Math.min(canvas.width, right + padding);
	const restoreBottom = Math.min(canvas.height, bottom + padding);
	const restoreWidth = restoreRight - restoreLeft;
	const restoreHeight = restoreBottom - restoreTop;

	// Include the stroke width in the restored area, then copy only that area back.
	ctx.drawImage(
		backgroundCanvas,
		restoreLeft,
		restoreTop,
		restoreWidth,
		restoreHeight,
		restoreLeft,
		restoreTop,
		restoreWidth,
		restoreHeight
	);
	hoverPlacement = nextPlacement;

	// When the mouse leaves the canvas, restoring the background is all that is needed.
	if (!nextPlacement) return;

	// Draw the new preview on top of the restored city without touching other tiles.
	ctx.save();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
	ctx.lineWidth = 2;
	ctx.setLineDash([6, 4]);
	ctx.strokeRect(nextPlacement.x, nextPlacement.y, nextPlacement.width, nextPlacement.height);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.fillRect(nextPlacement.x, nextPlacement.y, nextPlacement.width, nextPlacement.height);
	ctx.restore();
}

function getCellFromEvent(event) {
	const rect = canvas.getBoundingClientRect();
	const cellX = Math.floor((event.clientX - rect.left) / rect.width * cols);
	const cellY = Math.floor((event.clientY - rect.top) / rect.height * rows);
	return { x: cellX, y: cellY };
}

function getRoadLineCells(startCell, endCell) {
	const cells = [];
	const dx = endCell.x - startCell.x;
	const dy = endCell.y - startCell.y;
	const steps = Math.max(Math.abs(dx), Math.abs(dy));

	if (steps === 0) {
		return [{ x: startCell.x, y: startCell.y }];
	}

	for (let i = 0; i <= steps; i++) {
		const x = Math.round(startCell.x + (dx * i) / steps);
		const y = Math.round(startCell.y + (dy * i) / steps);
		cells.push({ x, y });
	}

	return cells.filter((cell, index, arr) => {
		return arr.findIndex((other) => other.x === cell.x && other.y === cell.y) === index;
	});
}

function placeRoadStretch(startCell, endCell) {
	const cells = getRoadLineCells(startCell, endCell).filter(({ x, y }) => {
		return x >= 0 && x < cols && y >= 0 && y < rows;
	});

	if (!cells.length) {
		document.querySelector('#report').textContent = 'That road is out of bounds.';
		return;
	}

	const newRoads = [];
	for (const { x, y } of cells) {
		if (grid[y][x] === 'land') {
			newRoads.push({ x, y });
		} else if (grid[y][x] !== 'road') {
			document.querySelector('#report').textContent = 'Roads can only be placed on empty land.';
			return;
		}
	}

	if (funds < prices.road * newRoads.length) {
		document.querySelector('#report').textContent = 'Not enough funds!';
		return;
	}

	for (const { x, y } of newRoads) {
		grid[y][x] = 'road';
	}

	funds -= prices.road * newRoads.length;
	document.querySelector('#report').textContent = newRoads.length > 1
		? 'Road stretch laid.'
		: 'ROAD placed.';
	persistGame();
	draw();
	update();
}

// === Save/load ===
function persistGame() {
	const payload = {
		funds,
		month,
		population,
		grid: grid.map((row) => [...row]),
		blockMap: Array.from(blockMap.entries())
	};

	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
	} catch (error) {
		console.error('Failed to save game:', error);
	}
}

function loadGame(showMessage = true) {
	const raw = localStorage.getItem(SAVE_KEY);
	if (!raw) {
		if (showMessage) {
			document.querySelector('#report').textContent = 'No saved city found.';
		}
		return false;
	}

	try {
		const saved = JSON.parse(raw);
		if (!saved || !Array.isArray(saved.grid)) {
			throw new Error('Invalid save data');
		}

		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				grid[y][x] = saved.grid[y]?.[x] ?? 'land';
			}
		}

		funds = Number(saved.funds ?? 5000);
		month = Number(saved.month ?? 0);
		population = Number(saved.population ?? 0);
		blockMap.clear();

		if (Array.isArray(saved.blockMap)) {
			for (const [key, value] of saved.blockMap) {
				blockMap.set(key, value);
			}
		}

		if (showMessage) {
			document.querySelector('#report').textContent = 'City loaded.';
		}
		draw();
		update();
		return true;
	} catch (error) {
		console.error('Failed to load game:', error);
		if (showMessage) {
			document.querySelector('#report').textContent = 'Save file could not be loaded.';
		}
		return false;
	}
}

function startNewGame() {
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			grid[y][x] = 'land';
		}
	}
	blockMap.clear();
	funds = 5000;
	month = 0;
	population = 0;
	localStorage.removeItem(SAVE_KEY);
	document.querySelector('#report').textContent = 'New city started.';
	draw();
	update();
}

function advanceMonth() {
	month++;
	const homes = grid.flat().filter((tile) => tile === 'res').length;
	const roads = grid.flat().filter((tile) => tile === 'road').length;

	population = Math.max(0, homes * 8 + Math.floor(roads / 2));
	funds += grid.flat().filter((tile) => tile === 'com' || tile === 'ind').length * 35 - Math.max(0, homes - roads) * 8;

	document.querySelector('#report').textContent = population
		? 'A new month begins. Growth is steady.'
		: 'Build homes beside roads to attract citizens.';

	persistGame();
	draw();
	update();
}

function updateTimeSpeedButtons() {
	document.querySelectorAll('.time-controls button').forEach((button) => {
		button.classList.toggle('selected', button.id === {
			paused: 'pause-time',
			slow: 'slow-time',
			fast: 'fast-time'
		}[timeSpeed]);
	});
}

// === UI updates ===
function update() {
	document.querySelector('#funds').textContent = funds;
	document.querySelector('#pop').textContent = population;
	document.querySelector('#year').textContent = 1900 + Math.floor(month / 12);
}

function gameLoop(timestamp) {
	if (!lastFrameTime) {
		lastFrameTime = timestamp;
	}

	const delta = timestamp - lastFrameTime;
	lastFrameTime = timestamp;

	if (timeSpeed === 'slow') {
		timeAccumulator += delta;
		if (timeAccumulator >= 1500) {
			timeAccumulator = 0;
			advanceMonth();
		}
	} else if (timeSpeed === 'fast') {
		timeAccumulator += delta;
		if (timeAccumulator >= 500) {
			timeAccumulator = 0;
			advanceMonth();
		}
	}

	requestAnimationFrame(gameLoop);
}

// === Tool selection ===
document.querySelectorAll('.tool').forEach((button) => {
	button.onclick = () => {
		document.querySelectorAll('.tool').forEach((item) => item.classList.remove('selected'));
		button.classList.add('selected');
		tool = button.dataset.tool;
		draw();
	};
});

canvas.addEventListener('mousemove', (event) => {
	canvas._hoverX = event.clientX;
	canvas._hoverY = event.clientY;
	drawHoverPreview();

	if (tool === 'road' && canvas._draggingRoad) {
		const cell = getCellFromEvent(event);
		if (cell.x !== canvas._dragEndCell?.x || cell.y !== canvas._dragEndCell?.y) {
			canvas._dragEndCell = cell;
			draw();
		}
	}
});

canvas.addEventListener('mouseleave', () => {
	canvas._hoverX = null;
	canvas._hoverY = null;
	canvas._draggingRoad = false;
	canvas._dragStartCell = null;
	canvas._dragEndCell = null;
	drawHoverPreview();
});

canvas.addEventListener('pointerdown', (event) => {
	if (tool !== 'road') return;
	const cell = getCellFromEvent(event);
	canvas._draggingRoad = true;
	canvas._dragStartCell = cell;
	canvas._dragEndCell = cell;
	canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointerup', (event) => {
	if (!canvas._draggingRoad || tool !== 'road') return;
	const cell = getCellFromEvent(event);
	placeRoadStretch(canvas._dragStartCell, cell);
	canvas._draggingRoad = false;
	canvas._dragStartCell = null;
	canvas._dragEndCell = null;
});

// === Building interaction ===
canvas.onclick = (event) => {
	if (tool === 'road') return;

	// Convert the browser click position into a grid cell, accounting for canvas scaling.
	const rect = canvas.getBoundingClientRect();
	const centerX = Math.floor((event.clientX - rect.left) / rect.width * cols);
	const centerY = Math.floor((event.clientY - rect.top) / rect.height * rows);
	const blockTools = ['res', 'com', 'ind'];
	const cells = [];
	const originX = centerX - 1;
	const originY = centerY - 1;

	// Bulldozing removes a full tracked building block or one ordinary occupied tile.
	if (tool === 'bulldozer') {
		if (centerX < 0 || centerX >= cols || centerY < 0 || centerY >= rows) {
			document.querySelector('#report').textContent = 'That tile is out of bounds.';
			return;
		}

		// A building can be identified from any one of its 3x3 cells.
		const blockInfo = blockMap.get(`${centerX},${centerY}`);
		if (blockInfo) {
			for (let y = blockInfo.originY; y < blockInfo.originY + 3; y++) {
				for (let x = blockInfo.originX; x < blockInfo.originX + 3; x++) {
					cells.push([x, y]);
				}
			}
		} else if (grid[centerY][centerX] !== 'land') {
			cells.push([centerX, centerY]);
		} else {
			document.querySelector('#report').textContent = 'There is nothing to clear.';
			return;
		}
	} else if (blockTools.includes(tool)) {
		// Building tools require a complete, in-bounds 3x3 area of empty land.
		for (let y = originY; y < originY + 3; y++) {
			for (let x = originX; x < originX + 3; x++) {
				if (x < 0 || x >= cols || y < 0 || y >= rows) {
					document.querySelector('#report').textContent = 'That block is out of bounds.';
					return;
				}

				if (grid[y][x] !== 'land') {
					document.querySelector('#report').textContent = 'All tiles in the block must be clear.';
					return;
				}

				cells.push([x, y]);
			}
		}
	} else {
		// Roads and parks affect one cell and cannot overwrite an existing tile.
		if (centerX < 0 || centerX >= cols || centerY < 0 || centerY >= rows) {
			document.querySelector('#report').textContent = 'That tile is out of bounds.';
			return;
		}

		if (grid[centerY][centerX] !== 'land') return;
		cells.push([centerX, centerY]);
	}

	// Reject the action before changing the map when the player cannot afford it.
	if (funds < prices[tool]) {
		document.querySelector('#report').textContent = 'Not enough funds!';
		return;
	}

	// Apply the selected tool to every validated cell.
	for (const [x, y] of cells) {
		grid[y][x] = tool === 'bulldozer' ? 'land' : tool;
	}

	// Track new buildings for rendering, or remove the old building records when clearing.
	if (blockTools.includes(tool)) {
		registerBlock(originX, originY, tool);
	} else if (tool === 'bulldozer') {
		for (const [x, y] of cells) {
			blockMap.delete(`${x},${y}`);
		}
	}

	// Charge the action, report the result, and redraw the changed city.
	funds -= prices[tool];
	document.querySelector('#report').textContent = tool === 'bulldozer'
		? 'Area cleared.'
		: tool.toUpperCase() + ' block placed.';
	persistGame();
	draw();
	update();
};

// === City progression ===
document.querySelector('#advance').onclick = () => {
	advanceMonth();
};

document.querySelector('#pause-time').onclick = () => {
	timeSpeed = 'paused';
	updateTimeSpeedButtons();
};

document.querySelector('#slow-time').onclick = () => {
	timeSpeed = 'slow';
	updateTimeSpeedButtons();
};

document.querySelector('#fast-time').onclick = () => {
	timeSpeed = 'fast';
	updateTimeSpeedButtons();
};

// === Save / load buttons ===
document.querySelector('#save-game').onclick = () => {
	persistGame();
	document.querySelector('#report').textContent = 'Game saved.';
};

document.querySelector('#load-game').onclick = () => {
	loadGame();
};

document.querySelector('#new-game').onclick = () => {
	startNewGame();
};

// === Start the game ===
updateTimeSpeedButtons();
requestAnimationFrame(gameLoop);
loadTiles()
	.then(() => {
		loadGame(false);
		draw();
		update();
	})
	.catch((err) => {
		console.error(err);
		document.querySelector('#report').textContent = 'Artwork failed to load.';
		draw();
		update();
	});