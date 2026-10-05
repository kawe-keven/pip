function createPetGraphics(context, emotionColors) {
  let baseColor = '#d4d7d4';
  function setBaseColor(value) { if (/^#[0-9a-f]{6}$/i.test(value)) baseColor = value; }
  function getEmotionColor(emotion, selectedBase = baseColor) {
    const base = parseColor(selectedBase);
    const total = Object.values(emotion).reduce((sum, value) => sum + value, 0);
    const mix = Math.min(0.16, total);
    const color = base.map((value, channel) => {
      const weighted = Object.entries(emotion).reduce((sum, [name, weight]) => {
        const target = parseColor(emotionColors[name]);
        return sum + target[channel] * weight;
      }, 0);
      return Math.round(value * (1 - mix) + (total ? weighted / total : value) * mix);
    });
    return `rgb(${color.join(',')})`;
  }

  function parseColor(value) {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16));
    const channels = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    return channels ? channels.slice(1).map(Number) : [212, 215, 212];
  }

  function mixHexColors(from, to, amount) {
    const start = parseColor(from);
    const end = parseColor(to);
    return `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * amount)).join(',')})`;
  }

  function getShellGradientColors(emotion) {
    const anger = Math.max(0, Math.min(1, emotion.angry || 0));
    const base = mixHexColors(baseColor, '#ff4b4b', 0.24 * anger);
    return [
      mixHexColors(base, '#ffffff', 0.38 * (1 - anger * 0.35)),
      mixHexColors(base, '#f4f6f3', 0.18 * (1 - anger * 0.35)),
      getEmotionColor(emotion, base),
      mixHexColors(base, '#101312', 0.42),
    ];
  }

  function getShellOutlineColor(emotion) {
    const anger = Math.max(0, Math.min(1, emotion.angry || 0));
    return mixHexColors(mixHexColors(baseColor, '#ff4b4b', 0.24 * anger), '#161a17', 0.5);
  }

  function getBaseHighlightAlpha() {
    const [red, green, blue] = parseColor(baseColor);
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    return 0.22 + luminance * 0.4;
  }

  function drawHeadsetBand(cx, top, width, alpha) {
    if (alpha < 0.01) return;
    context.save();
    context.globalAlpha = alpha;
    context.lineCap = 'round';
    context.strokeStyle = '#252a28'; context.lineWidth = 4.5;
    context.beginPath(); context.moveTo(cx - width * 0.34, top + 7);
    context.bezierCurveTo(cx - width * 0.34, top - 14, cx + width * 0.34, top - 14, cx + width * 0.34, top + 7); context.stroke();
    context.strokeStyle = '#e6e9e6'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(cx - width * 0.28, top + 5);
    context.bezierCurveTo(cx - width * 0.27, top - 10, cx + width * 0.27, top - 10, cx + width * 0.28, top + 5); context.stroke();
    context.restore();
  }

  function drawHeadsetCups(cx, cy, width, alpha) {
    if (alpha < 0.01) return;
    context.save();
    context.globalAlpha = alpha;
    for (const side of [-1, 1]) {
      const cupX = side < 0 ? cx - width / 2 - 4 : cx + width / 2 - 5;
      const cup = context.createLinearGradient(cupX, cy - 8, cupX + 9, cy + 8);
      cup.addColorStop(0, '#262c29'); cup.addColorStop(0.5, '#555e58'); cup.addColorStop(1, '#202522');
      context.beginPath(); context.roundRect(cupX, cy - 8, 9, 17, 4); context.fillStyle = cup; context.fill();
      context.strokeStyle = '#d9ded9'; context.lineWidth = 0.8; context.stroke();
    }
    context.restore();
  }

  function drawOutfit(cx, cy, width, height, outfitId) {
    const outfit = (window.PipOutfitCatalog || []).find((item) => item.id === outfitId);
    if (!outfit || outfit.style === 'none') return;
    const { style, primary, secondary, accent } = outfit;
    const left = cx - width / 2, right = cx + width / 2;
    const top = cy - height / 2, bottom = cy + height / 2;
    // Keep the face and eyes clear; every outfit starts below the eye line and
    // fills the complete lower shell, with the shell clip preserving its shape.
    const garmentTop = cy + height * 0.12;
    const garmentBottom = bottom + 1;
    const garmentLeft = left, garmentWidth = width;
    context.save();
    context.beginPath(); context.roundRect(left, top, width, height, height * 0.34); context.clip();
    const fabric = context.createLinearGradient(garmentLeft, garmentTop, garmentLeft + garmentWidth, garmentBottom);
    fabric.addColorStop(0, mixHexColors(primary, '#ffffff', 0.2));
    fabric.addColorStop(0.38, primary);
    fabric.addColorStop(1, mixHexColors(primary, secondary, 0.55));
    context.fillStyle = fabric;
    context.fillRect(garmentLeft, garmentTop, garmentWidth, garmentBottom - garmentTop);
    context.globalAlpha = 0.24; context.strokeStyle = '#ffffff'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(garmentLeft + 4, garmentTop + 2); context.quadraticCurveTo(cx, garmentTop - 1, garmentLeft + garmentWidth - 4, garmentTop + 2); context.stroke();
    context.globalAlpha = 0.3; context.strokeStyle = secondary; context.lineWidth = 0.8;
    context.beginPath(); context.moveTo(garmentLeft + 2, garmentTop + 4); context.lineTo(garmentLeft + 2, garmentBottom - 3); context.moveTo(garmentLeft + garmentWidth - 2, garmentTop + 4); context.lineTo(garmentLeft + garmentWidth - 2, garmentBottom - 3); context.stroke();
    context.globalAlpha = 1;

    const polygon = (points, fill) => {
      context.fillStyle = fill; context.beginPath(); context.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
      context.closePath(); context.fill();
    };
    const line = (points, color, widthPx = 1) => {
      context.strokeStyle = color; context.lineWidth = widthPx; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
      context.stroke();
    };
    const collarY = garmentTop + height * 0.13;
    if (style === 'scarf') {
      context.fillStyle = mixHexColors(primary, '#ffffff', 0.24); context.fillRect(garmentLeft, garmentTop, garmentWidth, height * 0.18);
      polygon([[cx + width * 0.2, garmentTop], [cx + width * 0.35, garmentTop], [cx + width * 0.28, bottom], [cx + width * 0.15, bottom - height * 0.05]], secondary);
      line([[garmentLeft + 2, garmentTop + 2], [right - width * 0.06, garmentTop + 2]], '#ffffff75', 1);
    } else if (style === 'cape') {
      polygon([[left + width * 0.17, garmentTop], [left + width * 0.02, bottom + 3], [right - width * 0.02, bottom + 3], [right - width * 0.17, garmentTop]], primary);
      line([[cx - width * 0.1, cy + 2], [cx, cy + height * 0.36], [cx + width * 0.1, cy + 2]], '#ffffff55', 1);
    } else if (style === 'robe') {
      polygon([[cx - width * 0.2, garmentTop], [cx, collarY], [cx - width * 0.07, garmentBottom], [cx - width * 0.38, garmentBottom]], mixHexColors(primary, '#ffffff', 0.12));
      polygon([[cx + width * 0.2, garmentTop], [cx, collarY], [cx + width * 0.07, garmentBottom], [cx + width * 0.38, garmentBottom]], secondary);
      line([[cx, collarY], [cx - width * 0.03, garmentBottom - 1]], accent, 1.5);
      context.fillStyle = accent; context.fillRect(cx - width * 0.34, cy + height * 0.2, width * 0.68, 2.5);
    } else if (['suit', 'pilot', 'king', 'bond', 'president-lula', 'president-obama', 'president-trump'].includes(style)) {
      polygon([[cx - width * 0.18, garmentTop], [cx + width * 0.18, garmentTop], [cx + width * 0.12, garmentBottom], [cx - width * 0.12, garmentBottom]], '#e8e5df');
      polygon([[cx - width * 0.18, garmentTop], [cx - width * 0.38, garmentTop + height * 0.08], [cx - width * 0.16, cy + height * 0.06], [cx - width * 0.05, collarY]], mixHexColors(primary, '#ffffff', 0.12));
      polygon([[cx + width * 0.18, garmentTop], [cx + width * 0.38, garmentTop + height * 0.08], [cx + width * 0.16, cy + height * 0.06], [cx + width * 0.05, collarY]], secondary);
      polygon([[cx - width * 0.045, collarY], [cx + width * 0.045, collarY], [cx + width * 0.07, garmentBottom - 2], [cx, garmentBottom], [cx - width * 0.07, garmentBottom - 2]], accent);
      context.fillStyle = mixHexColors(accent, '#ffffff', 0.28); context.beginPath(); context.arc(cx, collarY, 2.2, 0, Math.PI * 2); context.fill();
      if (style === 'pilot') {
        line([[left + width * 0.12, garmentTop + 2], [left + width * 0.28, garmentTop + 2]], '#edcf72', 1.5);
        line([[right - width * 0.28, garmentTop + 2], [right - width * 0.12, garmentTop + 2]], '#edcf72', 1.5);
      }
      if (style === 'king') line([[cx + width * 0.22, garmentTop + height * 0.2], [cx + width * 0.12, garmentBottom - 2]], '#e8e5df', 2.2);
      if (style === 'bond') {
        polygon([[cx - width * 0.06, collarY], [cx + width * 0.06, collarY], [cx + width * 0.04, collarY + 4], [cx, collarY + 6], [cx - width * 0.04, collarY + 4]], '#15171c');
        line([[cx + width * 0.23, garmentTop + 4], [cx + width * 0.34, garmentTop + 4], [cx + width * 0.31, garmentTop + 8]], '#eee8dc', 1.4);
      }
      if (style.startsWith('president-')) {
        context.fillStyle = '#e7d9b2'; context.beginPath(); context.arc(cx - width * 0.24, garmentTop + 7, 1.5, 0, Math.PI * 2); context.fill();
        if (style === 'president-obama') line([[cx - width * 0.045, collarY], [cx + width * 0.045, collarY], [cx + width * 0.06, garmentBottom - 2], [cx, garmentBottom], [cx - width * 0.06, garmentBottom - 2]], '#28609a', 2);
      }
    } else if (style === 'overalls' || style === 'overalls-cap' || style === 'overalls-goggles') {
      const overall = accent;
      const bibTop = garmentTop;
      const overalls = context.createLinearGradient(cx - width * 0.35, bibTop, cx + width * 0.35, garmentBottom);
      overalls.addColorStop(0, mixHexColors(overall, '#ffffff', 0.2)); overalls.addColorStop(1, mixHexColors(overall, '#172033', 0.3));
      context.fillStyle = overalls; context.beginPath(); context.roundRect(cx - width * 0.37, bibTop, width * 0.74, garmentBottom - bibTop, 4); context.fill();
      context.fillStyle = overall; context.beginPath(); context.roundRect(cx - width * 0.32, garmentTop, width * 0.13, bibTop - garmentTop + 4, 3); context.roundRect(cx + width * 0.19, garmentTop, width * 0.13, bibTop - garmentTop + 4, 3); context.fill();
      context.fillStyle = '#edc85b'; context.beginPath(); context.arc(cx - width * 0.25, bibTop + 4, 1.6, 0, Math.PI * 2); context.arc(cx + width * 0.25, bibTop + 4, 1.6, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#ffffff60'; context.lineWidth = 0.8; context.beginPath(); context.moveTo(cx, bibTop + 2); context.lineTo(cx, garmentBottom - 2); context.stroke();
    } else if (style === 'labcoat' || style === 'chef') {
      const shirt = style === 'chef' ? '#bf3032' : accent;
      polygon([[cx - width * 0.11, garmentTop], [cx + width * 0.11, garmentTop], [cx + width * 0.16, garmentBottom], [cx - width * 0.16, garmentBottom]], shirt);
      polygon([[cx - width * 0.23, garmentTop], [cx - width * 0.4, garmentTop + 4], [cx - width * 0.15, garmentTop + height * 0.25], [cx - width * 0.05, collarY]], mixHexColors(primary, '#ffffff', 0.15));
      polygon([[cx + width * 0.23, garmentTop], [cx + width * 0.4, garmentTop + 4], [cx + width * 0.15, garmentTop + height * 0.25], [cx + width * 0.05, collarY]], secondary);
      for (let i = 0; i < 3; i += 1) { context.fillStyle = style === 'chef' ? '#55565a' : secondary; context.beginPath(); context.arc(cx + width * 0.22, garmentTop + 6 + i * 4, 0.8, 0, Math.PI * 2); context.fill(); }
      if (style === 'labcoat') {
        context.strokeStyle = accent; context.lineWidth = 1.4; context.beginPath(); context.moveTo(cx - width * 0.12, collarY); context.bezierCurveTo(cx - width * 0.03, cy + 2, cx - width * 0.2, cy + 5, cx - width * 0.14, garmentBottom - 2); context.stroke();
        context.fillStyle = accent; context.beginPath(); context.arc(cx - width * 0.14, garmentBottom - 2, 1.7, 0, Math.PI * 2); context.fill();
      }
    } else if (style === 'scrubs' || style === 'astronaut' || style === 'space') {
      const panelColor = style === 'scrubs' ? accent : mixHexColors(primary, '#18314f', 0.45);
      context.fillStyle = panelColor; context.beginPath(); context.roundRect(cx - width * 0.23, garmentTop + 2, width * 0.46, garmentBottom - garmentTop - 4, 4); context.fill();
      line([[cx - width * 0.15, garmentTop + 3], [cx, collarY], [cx + width * 0.15, garmentTop + 3]], '#ffffffb0', 1.2);
      if (style === 'astronaut' || style === 'space') {
        context.strokeStyle = accent; context.lineWidth = 1.4; context.beginPath(); context.arc(cx - width * 0.27, cy + height * 0.07, 4.5, 0, Math.PI * 2); context.stroke();
        context.fillStyle = accent; context.beginPath(); context.arc(cx - width * 0.27, cy + height * 0.07, 1.3, 0, Math.PI * 2); context.fill();
        line([[cx + width * 0.23, garmentTop + 3], [cx + width * 0.23, garmentTop + 8]], '#e5edf3', 1.2);
      }
    } else if (style === 'firefighter' || style === 'builder') {
      const stripeY = style === 'builder' ? garmentTop + height * 0.1 : cy + height * 0.19;
      context.fillStyle = accent; context.fillRect(garmentLeft + 1, stripeY, garmentWidth - 2, 3.5);
      context.fillStyle = mixHexColors(accent, '#ffffff', 0.45); context.fillRect(garmentLeft + 1, stripeY, garmentWidth - 2, 1);
      if (style === 'firefighter') {
        context.strokeStyle = '#292d32'; context.lineWidth = 1; context.beginPath(); context.arc(cx, garmentTop + 2, width * 0.12, Math.PI, 0); context.stroke();
      }
    } else if (style === 'hoodie') {
      context.strokeStyle = mixHexColors(primary, '#ffffff', 0.55); context.lineWidth = 1; context.beginPath(); context.moveTo(cx, garmentTop + 3); context.lineTo(cx, garmentBottom - 2); context.stroke();
      line([[cx - width * 0.13, garmentTop + 2], [cx - width * 0.1, garmentTop + 9]], '#e2e5ef', 0.8);
      line([[cx + width * 0.13, garmentTop + 2], [cx + width * 0.1, garmentTop + 9]], '#e2e5ef', 0.8);
      context.strokeStyle = accent; context.lineWidth = 1.3; context.beginPath(); context.moveTo(cx - width * 0.18, garmentBottom - 4); context.quadraticCurveTo(cx, garmentBottom - 1, cx + width * 0.18, garmentBottom - 4); context.stroke();
    } else if (style === 'detective') {
      polygon([[cx - width * 0.13, garmentTop], [cx + width * 0.13, garmentTop], [cx + width * 0.33, garmentBottom], [cx - width * 0.33, garmentBottom]], secondary);
      polygon([[cx - width * 0.13, garmentTop], [cx, garmentTop + 5], [cx - width * 0.03, garmentBottom]], primary);
      polygon([[cx + width * 0.13, garmentTop], [cx, garmentTop + 5], [cx + width * 0.03, garmentBottom]], mixHexColors(primary, '#ffffff', 0.15));
      context.fillStyle = accent; context.fillRect(cx - 2, garmentBottom - 4, 4, 2);
    } else if (style === 'country') {
      context.strokeStyle = accent; context.lineWidth = 0.7;
      for (let offset = -2; offset <= 2; offset += 4) { context.beginPath(); context.moveTo(cx + offset, garmentTop + 1); context.lineTo(cx + offset, garmentBottom - 1); context.stroke(); }
      line([[garmentLeft + 3, cy + 1], [right - width * 0.05, cy + 1]], '#ffffff70', 0.8);
    } else if (style === 'rock' || style === 'rap' || style === 'pop') {
      line([[cx - width * 0.22, garmentTop + 2], [cx + width * 0.2, garmentBottom - 2]], accent, style === 'rock' ? 1.8 : 1.2);
      if (style === 'rock') {
        for (let i = 0; i < 3; i += 1) { context.fillStyle = '#c4c6cc'; context.beginPath(); context.arc(cx - width * 0.25 + i * 3, garmentTop + 5, 0.7, 0, Math.PI * 2); context.fill(); }
      } else if (style === 'rap') {
        context.strokeStyle = '#f2d36d'; context.lineWidth = 1.3; context.beginPath(); context.arc(cx, garmentTop + 6, 5, 0.15 * Math.PI, 0.85 * Math.PI); context.stroke();
      } else {
        context.fillStyle = '#fff1a5'; context.globalAlpha = 0.8;
        for (const [sx, sy] of [[cx - 15, garmentTop + 4], [cx + 13, cy + 7], [cx, garmentBottom - 3]]) { context.beginPath(); context.arc(sx, sy, 1, 0, Math.PI * 2); context.fill(); }
      }
    } else if (style === 'martial') {
      polygon([[cx - width * 0.18, garmentTop], [cx + width * 0.18, garmentTop], [cx + width * 0.3, garmentBottom], [cx - width * 0.3, garmentBottom]], primary);
      line([[cx - width * 0.18, garmentTop + 1], [cx, cy + 4], [cx + width * 0.1, garmentTop + 1]], '#fff2dc', 1.2);
      context.fillStyle = accent; context.fillRect(cx - width * 0.34, cy + height * 0.22, width * 0.68, 3.2);
      line([[cx, cy + height * 0.23], [cx + width * 0.09, garmentBottom - 1]], mixHexColors(accent, '#ffffff', 0.2), 1.1);
    } else if (style === 'ogre') {
      polygon([[cx - width * 0.12, garmentTop], [cx + width * 0.12, garmentTop], [cx + width * 0.34, garmentBottom], [cx - width * 0.34, garmentBottom]], secondary);
      context.fillStyle = accent; context.fillRect(cx - width * 0.35, cy + height * 0.21, width * 0.7, 3.4);
      line([[cx - width * 0.1, garmentTop + 2], [cx, cy + 4], [cx + width * 0.1, garmentTop + 2]], '#c8d6a0', 1.1);
    } else if (style === 'pirate') {
      for (let i = 0; i < 3; i += 1) { context.fillStyle = i % 2 ? '#eee5d4' : primary; context.fillRect(garmentLeft + 1, garmentTop + i * 5, garmentWidth - 2, 2.7); }
      polygon([[cx - width * 0.24, garmentTop], [cx + width * 0.24, garmentTop], [cx + width * 0.37, garmentBottom], [cx - width * 0.37, garmentBottom]], secondary);
      context.fillStyle = accent; context.fillRect(cx - width * 0.36, cy + height * 0.22, width * 0.72, 3);
      context.fillStyle = '#edcf75'; context.beginPath(); context.arc(cx, cy + height * 0.26, 2.1, 0, Math.PI * 2); context.fill();
    } else if (style === 'royal') {
      polygon([[cx - width * 0.13, garmentTop], [cx + width * 0.13, garmentTop], [cx + width * 0.37, garmentBottom], [cx - width * 0.37, garmentBottom]], mixHexColors(primary, '#ffffff', 0.15));
      context.fillStyle = accent; context.fillRect(cx - width * 0.36, cy + height * 0.2, width * 0.72, 2.2);
      for (let i = -1; i <= 1; i += 1) { context.fillStyle = '#fff0b8'; context.beginPath(); context.arc(cx + i * 5, garmentTop + 5, 0.8, 0, Math.PI * 2); context.fill(); }
    } else if (style === 'spider') {
      line([[cx, garmentTop + 3], [cx, garmentBottom - 1]], accent, 1);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i += 1) {
        line([[cx + side * 2, garmentTop + 6 + i * 4], [cx + side * (8 + i * 2), garmentTop + 5 + i * 4]], '#d8e5f7a0', 0.7);
      }
      context.fillStyle = '#eee9de'; context.beginPath(); context.ellipse(cx, garmentTop + height * 0.2, 4, 2.3, 0, 0, Math.PI * 2); context.fill();
    } else if (style === 'comic') {
      polygon([[cx - width * 0.13, garmentTop], [cx + width * 0.13, garmentTop], [cx + width * 0.3, garmentBottom], [cx - width * 0.3, garmentBottom]], accent);
      context.fillStyle = '#fff3b0'; context.beginPath(); context.arc(cx, garmentTop + height * 0.23, 2.5, 0, Math.PI * 2); context.fill();
    } else if (style === 'mario') {
      const overall = context.createLinearGradient(cx - width * 0.3, garmentTop, cx + width * 0.3, garmentBottom);
      overall.addColorStop(0, mixHexColors(accent, '#ffffff', 0.18)); overall.addColorStop(1, mixHexColors(accent, '#101e45', 0.32));
      context.fillStyle = overall; context.beginPath(); context.roundRect(cx - width * 0.34, garmentTop + 2, width * 0.68, garmentBottom - garmentTop - 2, 4); context.fill();
      context.fillStyle = primary; context.fillRect(cx - width * 0.34, garmentTop, width * 0.68, 5);
      context.fillStyle = '#f4d256'; for (const side of [-1, 1]) { context.beginPath(); context.arc(cx + side * width * 0.22, garmentTop + 5, 1.5, 0, Math.PI * 2); context.fill(); }
    } else if (style === 'mouse') {
      context.fillStyle = primary; context.fillRect(garmentLeft, garmentTop + height * 0.56, garmentWidth, height * 0.44);
      context.fillStyle = '#f1d05a'; for (const side of [-1, 1]) { context.beginPath(); context.arc(cx + side * width * 0.12, garmentTop + height * 0.72, 1.5, 0, Math.PI * 2); context.fill(); }
    } else if (style === 'batman') {
      polygon([[cx - 10, garmentTop + 7], [cx - 5, garmentTop + 4], [cx, garmentTop + 7], [cx + 5, garmentTop + 4], [cx + 10, garmentTop + 7], [cx + 7, garmentTop + 12], [cx, garmentTop + 10], [cx - 7, garmentTop + 12]], '#e4c54e');
      polygon([[cx - 8, garmentTop + 7], [cx - 3, garmentTop + 8], [cx, garmentTop + 6], [cx + 3, garmentTop + 8], [cx + 8, garmentTop + 7], [cx + 5, garmentTop + 10], [cx, garmentTop + 9], [cx - 5, garmentTop + 10]], '#11151c');
    } else if (style === 'vader') {
      polygon([[cx - width * 0.34, garmentTop], [cx + width * 0.34, garmentTop], [cx + width * 0.26, garmentBottom], [cx - width * 0.26, garmentBottom]], secondary);
      context.fillStyle = '#c9cdd3'; context.fillRect(cx - width * 0.2, garmentTop + 3, width * 0.4, 2);
      context.fillStyle = '#a94145'; context.fillRect(cx - 7, garmentTop + 8, 4, 3); context.fillStyle = '#7091b7'; context.fillRect(cx + 3, garmentTop + 8, 4, 3);
      for (let i = -2; i <= 2; i += 1) line([[cx + i * 2, garmentTop + 14], [cx + i * 2, garmentTop + 18]], '#b9bec7', 0.8);
    } else if (style === 'joker') {
      polygon([[cx - width * 0.12, garmentTop + 2], [cx + width * 0.12, garmentTop + 2], [cx + width * 0.3, garmentBottom], [cx - width * 0.3, garmentBottom]], accent);
      polygon([[cx - width * 0.045, garmentTop + 3], [cx + width * 0.045, garmentTop + 3], [cx + width * 0.07, garmentBottom - 2], [cx, garmentBottom], [cx - width * 0.07, garmentBottom - 2]], '#ad334b');
      context.fillStyle = '#ded27b'; context.beginPath(); context.arc(cx, garmentTop + 5, 1.5, 0, Math.PI * 2); context.fill();
    } else if (style === 'explorer') {
      line([[cx + width * 0.22, garmentTop + 1], [cx - width * 0.2, garmentBottom - 1]], accent, 3);
      context.fillStyle = secondary; context.fillRect(cx + width * 0.12, garmentTop + 5, width * 0.13, 5);
    } else if (style === 'mj') {
      for (let i = 0; i < 3; i += 1) {
        context.fillStyle = accent; context.fillRect(cx - width * 0.27, garmentTop + 4 + i * 5, width * 0.54, 1.3);
        for (const side of [-1, 1]) { context.beginPath(); context.arc(cx + side * width * 0.29, garmentTop + 4.6 + i * 5, 1.3, 0, Math.PI * 2); context.fill(); }
      }
      line([[cx - width * 0.19, garmentBottom - 3], [cx, garmentBottom - 1]], '#f4f0e8', 1.5);
    } else if (style === 'elvis') {
      polygon([[cx - width * 0.2, garmentTop], [cx, garmentTop + 7], [cx - width * 0.04, garmentBottom], [cx - width * 0.31, garmentBottom]], '#fffdf2');
      polygon([[cx + width * 0.2, garmentTop], [cx, garmentTop + 7], [cx + width * 0.04, garmentBottom], [cx + width * 0.31, garmentBottom]], '#fffdf2');
      line([[cx - width * 0.3, garmentTop + 6], [cx, garmentTop + 12], [cx + width * 0.3, garmentTop + 6]], accent, 1.5);
      context.fillStyle = accent; context.fillRect(cx - width * 0.31, garmentBottom - 5, width * 0.62, 2);
    } else if (style === 'madonna') {
      polygon([[cx - width * 0.2, garmentTop], [cx, garmentTop + 6], [cx - width * 0.08, garmentBottom], [cx - width * 0.4, garmentBottom]], mixHexColors(primary, '#ffffff', 0.16));
      polygon([[cx + width * 0.2, garmentTop], [cx, garmentTop + 6], [cx + width * 0.08, garmentBottom], [cx + width * 0.4, garmentBottom]], secondary);
      context.fillStyle = accent; context.fillRect(cx - width * 0.37, garmentTop + 7, width * 0.74, 2);
      for (const side of [-1, 1]) { context.fillStyle = '#f2dfc3'; context.beginPath(); context.arc(cx + side * width * 0.2, garmentTop + 12, 1.5, 0, Math.PI * 2); context.fill(); }
    } else if (style === 'freddie') {
      context.fillStyle = secondary; context.fillRect(cx - width * 0.3, garmentTop, width * 0.6, height * 0.18);
      polygon([[cx - width * 0.22, garmentTop], [cx - width * 0.1, garmentTop + 2], [cx - width * 0.17, garmentTop + 7], [cx - width * 0.27, garmentTop + 5]], primary);
      polygon([[cx + width * 0.22, garmentTop], [cx + width * 0.1, garmentTop + 2], [cx + width * 0.17, garmentTop + 7], [cx + width * 0.27, garmentTop + 5]], primary);
      context.fillStyle = '#f0eee7'; context.fillRect(cx - 2, garmentTop + 3, 4, 3);
    }
    context.restore();

    if (style === 'overalls-cap') {
      const cap = context.createLinearGradient(cx, top - 3, cx, top + 8);
      cap.addColorStop(0, mixHexColors(primary, '#ffffff', 0.25)); cap.addColorStop(1, secondary);
      context.fillStyle = cap; context.beginPath(); context.ellipse(cx, top + 4, width * 0.22, height * 0.13, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = primary; context.beginPath(); context.ellipse(cx + width * 0.14, top + 5, width * 0.2, height * 0.035, 0, 0, Math.PI * 2); context.fill();
    } else if (style === 'overalls-goggles') {
      context.strokeStyle = '#d6b34e'; context.lineWidth = 2.2;
      for (const side of [-1, 1]) { context.beginPath(); context.arc(cx + side * width * 0.22, cy + height * 0.2, width * 0.105, 0, Math.PI * 2); context.stroke(); }
      context.beginPath(); context.moveTo(cx - width * 0.12, cy + height * 0.2); context.lineTo(cx + width * 0.12, cy + height * 0.2); context.stroke();
    } else if (style === 'royal') {
      context.fillStyle = '#f0c75e'; context.beginPath(); context.moveTo(cx - width * 0.2, top + 4); context.lineTo(cx - width * 0.2, top - 4); context.lineTo(cx - width * 0.07, top); context.lineTo(cx, top - 7); context.lineTo(cx + width * 0.07, top); context.lineTo(cx + width * 0.2, top - 4); context.lineTo(cx + width * 0.2, top + 4); context.closePath(); context.fill();
    } else if (style === 'astronaut' || style === 'space') {
      context.strokeStyle = '#c8d5e2'; context.lineWidth = 1.6; context.beginPath(); context.ellipse(cx, cy - height * 0.08, width * 0.43, height * 0.42, 0, Math.PI, Math.PI * 2); context.stroke();
      context.strokeStyle = '#ffffff70'; context.lineWidth = 0.8; context.beginPath(); context.arc(cx - width * 0.08, cy - height * 0.14, width * 0.25, Math.PI * 1.1, Math.PI * 1.65); context.stroke();
    } else if (style === 'pirate') {
      context.fillStyle = secondary; context.beginPath(); context.ellipse(cx, top + 2, width * 0.39, height * 0.09, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = primary; context.beginPath(); context.ellipse(cx, top + 3, width * 0.52, height * 0.055, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.12, top - 1, width * 0.24, 2);
    } else if (style === 'country') {
      context.fillStyle = secondary; context.beginPath(); context.ellipse(cx, top + 2, width * 0.37, height * 0.07, 0, Math.PI, Math.PI * 2); context.fill();
      const hat = context.createLinearGradient(cx, top - 5, cx, top + 3); hat.addColorStop(0, mixHexColors(primary, '#ffffff', 0.24)); hat.addColorStop(1, secondary);
      context.fillStyle = hat; context.beginPath(); context.roundRect(cx - width * 0.2, top - 6, width * 0.4, height * 0.18, 3); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.2, top + 1, width * 0.4, 1.8);
    } else if (style === 'ogre') {
      context.fillStyle = mixHexColors(primary, '#ffffff', 0.1);
      for (const side of [-1, 1]) { context.beginPath(); context.ellipse(cx + side * width * 0.47, top + 7, width * 0.13, height * 0.11, side * 0.35, 0, Math.PI * 2); context.fill(); }
    } else if (style === 'firefighter') {
      const helmet = context.createLinearGradient(cx, top - 3, cx, top + 4); helmet.addColorStop(0, '#f0bf4d'); helmet.addColorStop(1, '#a46a29');
      context.fillStyle = helmet; context.beginPath(); context.ellipse(cx, top + 2, width * 0.36, height * 0.1, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = '#e1b64f'; context.fillRect(cx - width * 0.37, top + 1, width * 0.74, 2);
    } else if (style === 'chef') {
      context.fillStyle = '#f2f0e8';
      for (const [dx, dy, radius] of [[-8, -4, 6], [0, -7, 7], [8, -4, 6]]) { context.beginPath(); context.arc(cx + dx, top + 5 + dy, radius, 0, Math.PI * 2); context.fill(); }
      context.fillRect(cx - 13, top + 3, 26, 5);
    } else if (style === 'pilot') {
      context.fillStyle = secondary; context.beginPath(); context.ellipse(cx, top + 2, width * 0.3, height * 0.08, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = primary; context.beginPath(); context.roundRect(cx - width * 0.2, top - 5, width * 0.4, height * 0.16, 3); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.2, top + 1, width * 0.4, 1.4);
    } else if (style === 'detective') {
      context.fillStyle = primary; context.beginPath(); context.ellipse(cx, top + 2, width * 0.31, height * 0.07, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = secondary; context.beginPath(); context.roundRect(cx - width * 0.16, top - 5, width * 0.32, height * 0.16, 3); context.fill();
    } else if (style === 'mouse') {
      const ear = context.createRadialGradient(cx - 1, top + 1, 1, cx, top + 3, width * 0.13);
      ear.addColorStop(0, '#55545b'); ear.addColorStop(1, '#101115'); context.fillStyle = ear;
      for (const side of [-1, 1]) { context.beginPath(); context.arc(cx + side * width * 0.25, top + 2, width * 0.13, 0, Math.PI * 2); context.fill(); }
    } else if (style === 'batman') {
      const cowl = context.createLinearGradient(cx, top - 9, cx, top + 4);
      cowl.addColorStop(0, '#333943'); cowl.addColorStop(1, '#11151c'); context.fillStyle = cowl;
      context.beginPath(); context.moveTo(cx - width * 0.24, top + 4); context.lineTo(cx - width * 0.21, top - 10); context.lineTo(cx - width * 0.05, top - 3); context.lineTo(cx, top - 6); context.lineTo(cx + width * 0.05, top - 3); context.lineTo(cx + width * 0.21, top - 10); context.lineTo(cx + width * 0.24, top + 4); context.closePath(); context.fill();
    } else if (style === 'mario') {
      const cap = context.createLinearGradient(cx, top - 8, cx, top + 5);
      cap.addColorStop(0, '#f05a4c'); cap.addColorStop(1, primary); context.fillStyle = cap;
      context.beginPath(); context.ellipse(cx, top + 1, width * 0.25, height * 0.15, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = primary; context.beginPath(); context.ellipse(cx + width * 0.12, top + 3, width * 0.3, height * 0.05, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fff4e8'; context.beginPath(); context.arc(cx, top + 1, 3.2, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#b52d2b'; context.font = 'bold 4px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('M', cx, top + 1.5);
    } else if (style === 'vader') {
      const helmet = context.createLinearGradient(cx, top - 4, cx, top + 7);
      helmet.addColorStop(0, '#4c5057'); helmet.addColorStop(0.4, '#17191d'); helmet.addColorStop(1, '#070809'); context.fillStyle = helmet;
      context.beginPath(); context.ellipse(cx, top + 1, width * 0.39, height * 0.2, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = '#15171b'; context.beginPath(); context.roundRect(cx - width * 0.43, top + 1, width * 0.13, height * 0.15, 2); context.roundRect(cx + width * 0.3, top + 1, width * 0.13, height * 0.15, 2); context.fill();
    } else if (style === 'explorer') {
      const hat = context.createLinearGradient(cx, top - 8, cx, top + 5);
      hat.addColorStop(0, '#bd8750'); hat.addColorStop(1, primary); context.fillStyle = hat;
      context.beginPath(); context.ellipse(cx, top + 2, width * 0.3, height * 0.08, 0, Math.PI, Math.PI * 2); context.fill();
      context.beginPath(); context.roundRect(cx - width * 0.2, top - 5, width * 0.4, height * 0.14, 3); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.2, top + 1, width * 0.4, 1.6);
    } else if (style === 'mj') {
      context.fillStyle = '#17181d'; context.beginPath(); context.ellipse(cx, top + 3, width * 0.36, height * 0.07, 0, Math.PI, Math.PI * 2); context.fill();
      const hat = context.createLinearGradient(cx, top - 7, cx, top + 3); hat.addColorStop(0, '#42434a'); hat.addColorStop(1, '#17181d'); context.fillStyle = hat;
      context.beginPath(); context.roundRect(cx - width * 0.19, top - 6, width * 0.38, height * 0.15, 3); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.19, top + 1, width * 0.38, 1.5);
    } else if (style === 'elvis') {
      context.fillStyle = '#17191e'; context.beginPath(); context.moveTo(cx - width * 0.25, top + 5); context.quadraticCurveTo(cx - width * 0.23, top - 6, cx - width * 0.02, top - 3); context.quadraticCurveTo(cx + width * 0.12, top - 9, cx + width * 0.24, top + 2); context.lineTo(cx + width * 0.14, top + 5); context.quadraticCurveTo(cx, top - 1, cx - width * 0.12, top + 5); context.closePath(); context.fill();
      context.fillStyle = accent; context.beginPath(); context.arc(cx, top + 2, 1.1, 0, Math.PI * 2); context.fill();
    } else if (style === 'madonna') {
      context.fillStyle = '#ead6c7'; context.beginPath(); context.arc(cx, top + 1, width * 0.22, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = accent;
      context.beginPath(); context.moveTo(cx + width * 0.21, top - 1); context.lineTo(cx + width * 0.38, top - 6); context.lineTo(cx + width * 0.34, top + 1); context.lineTo(cx + width * 0.43, top + 5); context.lineTo(cx + width * 0.25, top + 3); context.closePath(); context.fill();
    } else if (style === 'freddie') {
      context.fillStyle = '#e9e8e2'; context.beginPath(); context.roundRect(cx - width * 0.24, top + 1, width * 0.48, height * 0.07, 2); context.fill();
      context.fillStyle = '#73747a'; context.fillRect(cx - width * 0.12, top + 2, width * 0.24, 1);
    } else if (style === 'joker') {
      context.fillStyle = '#398348'; context.beginPath(); context.moveTo(cx - width * 0.24, top + 5); context.lineTo(cx - width * 0.22, top - 1); context.lineTo(cx - width * 0.1, top + 3); context.lineTo(cx + width * 0.03, top - 4); context.lineTo(cx + width * 0.12, top + 2); context.lineTo(cx + width * 0.25, top - 1); context.lineTo(cx + width * 0.24, top + 5); context.closePath(); context.fill();
    } else if (style === 'president-trump') {
      const hair = context.createLinearGradient(cx - width * 0.2, top - 2, cx + width * 0.2, top + 4);
      hair.addColorStop(0, '#d8ad4d'); hair.addColorStop(1, '#a7762b'); context.fillStyle = hair;
      context.beginPath(); context.ellipse(cx, top + 1, width * 0.27, height * 0.08, 0, Math.PI, Math.PI * 2); context.fill();
    } else if (style === 'president-lula' || style === 'president-obama') {
      context.fillStyle = '#25252a'; context.beginPath(); context.ellipse(cx, top + 2, width * 0.25, height * 0.06, 0, Math.PI, Math.PI * 2); context.fill();
    } else if (style === 'robe' && outfit.id === 'wizard') {
      const hat = context.createLinearGradient(cx - width * 0.2, top - 12, cx + width * 0.2, top + 4);
      hat.addColorStop(0, mixHexColors(primary, '#ffffff', 0.38)); hat.addColorStop(0.48, primary); hat.addColorStop(1, secondary);
      context.fillStyle = hat; context.beginPath(); context.moveTo(cx - width * 0.23, top + 3); context.lineTo(cx - width * 0.07, top - 15); context.quadraticCurveTo(cx + width * 0.01, top - 12, cx + width * 0.04, top - 5); context.quadraticCurveTo(cx + width * 0.11, top - 2, cx + width * 0.23, top + 3); context.closePath(); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.23, top + 1, width * 0.46, 2);
      context.fillStyle = '#f4df91'; context.beginPath(); context.arc(cx + width * 0.08, top - 4, 1.5, 0, Math.PI * 2); context.fill();
    } else if (style === 'robe' && outfit.id === 'space-knight') {
      const hood = context.createLinearGradient(cx, top - 5, cx, cy + 4);
      hood.addColorStop(0, mixHexColors(primary, '#ffffff', 0.2)); hood.addColorStop(1, secondary);
      context.fillStyle = hood; context.beginPath(); context.ellipse(cx, top + 1, width * 0.37, height * 0.12, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = accent; context.fillRect(cx - width * 0.37, top + 1, width * 0.74, 2);
    }
  }

  function drawHair(cx, top, style, color = '#543c35') {
    if (!['tuft', 'fringe', 'curly', 'afro'].includes(style)) return;
    context.save(); context.fillStyle = color; context.beginPath();
    if (style === 'tuft') {
      context.moveTo(cx - 13, top + 8); context.quadraticCurveTo(cx - 12, top - 9, cx - 2, top + 3);
      context.quadraticCurveTo(cx + 8, top - 10, cx + 13, top + 8);
    } else if (style === 'fringe') {
      context.moveTo(cx - 18, top + 5); context.quadraticCurveTo(cx, top - 6, cx + 18, top + 5);
      context.lineTo(cx + 13, top + 13); context.lineTo(cx + 7, top + 8); context.lineTo(cx, top + 14);
      context.lineTo(cx - 7, top + 8); context.lineTo(cx - 13, top + 13);
    } else if (style === 'curly') {
      context.moveTo(cx - 19, top + 7);
      for (let i = 0; i <= 8; i += 1) {
        const px = cx - 19 + i * 4.75;
        context.arc(px, top + 2 + (i % 2) * 1.5, 3.5, Math.PI, Math.PI * 2);
      }
      context.lineTo(cx + 19, top + 8); context.lineTo(cx - 19, top + 8);
    } else {
      context.moveTo(cx - 19, top + 8);
      context.bezierCurveTo(cx - 25, top + 2, cx - 19, top - 10, cx - 11, top - 8);
      context.bezierCurveTo(cx - 8, top - 17, cx + 5, top - 14, cx + 7, top - 9);
      context.bezierCurveTo(cx + 19, top - 14, cx + 24, top - 1, cx + 19, top + 8);
    }
    context.closePath(); context.fill();
    if (style === 'curly' || style === 'afro') {
      context.globalAlpha = 0.2; context.fillStyle = '#ffffff';
      for (const dx of [-12, -6, 0, 6, 12]) { context.beginPath(); context.arc(cx + dx, top - 2, 1, 0, Math.PI * 2); context.fill(); }
    }
    context.restore();
  }

  function drawAccessory(cx, cy, top, width, style) {
    if (style === 'crown') {
      context.fillStyle = '#f0c75e'; context.beginPath(); context.moveTo(cx - 12, top + 4); context.lineTo(cx - 12, top - 8);
      context.lineTo(cx - 4, top - 2); context.lineTo(cx, top - 10); context.lineTo(cx + 4, top - 2);
      context.lineTo(cx + 12, top - 8); context.lineTo(cx + 12, top + 4); context.closePath(); context.fill();
    } else if (style === 'glasses' || style === 'sunglasses') {
      context.save();
      if (style === 'sunglasses') { context.fillStyle = '#171a23'; for (const side of [-1, 1]) { context.beginPath(); context.roundRect(cx + side * 14 - 6, cy - 8, 12, 12, 4); context.fill(); context.strokeStyle = '#a5b8d7'; context.lineWidth = 0.8; context.stroke(); } }
      else { context.strokeStyle = '#302f3d'; context.lineWidth = 1.5; for (const side of [-1, 1]) { context.beginPath(); context.roundRect(cx + side * 14 - 6, cy - 8, 12, 12, 4); context.stroke(); } }
      context.strokeStyle = style === 'sunglasses' ? '#a5b8d7' : '#302f3d'; context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(cx - 2, cy - 2); context.lineTo(cx + 2, cy - 2); context.stroke(); context.restore();
    } else if (style === 'beanie') {
      const hat = context.createLinearGradient(cx, top - 8, cx, top + 4); hat.addColorStop(0, '#63a7dc'); hat.addColorStop(1, '#255789');
      context.fillStyle = hat; context.beginPath(); context.ellipse(cx, top + 3, width * 0.3, 7, 0, Math.PI, Math.PI * 2); context.fill();
      context.fillStyle = '#bfdaf0'; context.beginPath(); context.roundRect(cx - width * 0.28, top + 1, width * 0.56, 3, 2); context.fill();
      context.fillStyle = '#dbefff'; context.beginPath(); context.arc(cx, top - 4, 2.4, 0, Math.PI * 2); context.fill();
    } else if (style === 'santa-hat') {
      const hat = context.createLinearGradient(cx, top - 13, cx, top + 4); hat.addColorStop(0, '#f35550'); hat.addColorStop(1, '#9c2228');
      context.fillStyle = hat; context.beginPath(); context.moveTo(cx - width * 0.27, top + 3); context.quadraticCurveTo(cx - width * 0.15, top - 13, cx + width * 0.22, top - 9); context.lineTo(cx + width * 0.25, top + 2); context.closePath(); context.fill();
      context.fillStyle = '#f4f0eb'; context.beginPath(); context.roundRect(cx - width * 0.28, top + 1, width * 0.56, 4, 2); context.fill();
      context.beginPath(); context.arc(cx + width * 0.22, top - 8, 3.5, 0, Math.PI * 2); context.fill();
    } else if (style === 'party-hat') {
      const hat = context.createLinearGradient(cx - 8, top - 13, cx + 8, top + 3); hat.addColorStop(0, '#ef79ba'); hat.addColorStop(1, '#8349a9');
      context.fillStyle = hat; context.beginPath(); context.moveTo(cx - width * 0.19, top + 3); context.lineTo(cx + 1, top - 14); context.lineTo(cx + width * 0.2, top + 3); context.closePath(); context.fill();
      context.fillStyle = '#f4d45a'; for (const [dx, dy] of [[-4, -1], [3, -5], [7, 1]]) { context.beginPath(); context.arc(cx + dx, top + dy, 1.2, 0, Math.PI * 2); context.fill(); }
      context.fillStyle = '#f4eee7'; context.beginPath(); context.arc(cx + 1, top - 14, 2.4, 0, Math.PI * 2); context.fill();
    } else if (style === 'witch-hat') {
      context.fillStyle = '#382361'; context.beginPath(); context.ellipse(cx, top + 3, width * 0.37, 3, 0, 0, Math.PI * 2); context.fill();
      const hat = context.createLinearGradient(cx - 10, top - 13, cx + 8, top + 4); hat.addColorStop(0, '#774ac3'); hat.addColorStop(1, '#2b1b4a');
      context.fillStyle = hat; context.beginPath(); context.moveTo(cx - width * 0.22, top + 2); context.lineTo(cx - 2, top - 15); context.quadraticCurveTo(cx + 4, top - 7, cx + width * 0.22, top + 2); context.closePath(); context.fill();
      context.fillStyle = '#d5a948'; context.fillRect(cx - width * 0.2, top + 1, width * 0.4, 2);
    } else if (style === 'bow') {
      context.fillStyle = '#d95d83'; context.beginPath(); context.moveTo(cx, top + 1); context.quadraticCurveTo(cx - 13, top - 10, cx - 12, top + 1); context.quadraticCurveTo(cx - 10, top + 7, cx, top + 3); context.quadraticCurveTo(cx + 10, top + 7, cx + 12, top + 1); context.quadraticCurveTo(cx + 13, top - 10, cx, top + 1); context.fill();
      context.fillStyle = '#f3c36d'; context.beginPath(); context.arc(cx, top + 2, 2.2, 0, Math.PI * 2); context.fill();
    } else if (style === 'pumpkin') {
      const fruit = context.createRadialGradient(cx - 4, top + 1, 1, cx, top + 4, 12); fruit.addColorStop(0, '#ffa942'); fruit.addColorStop(1, '#bd4c1f');
      context.fillStyle = fruit; context.beginPath(); context.ellipse(cx, top + 4, width * 0.21, 6, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#723a20'; context.lineWidth = 0.8; context.beginPath(); context.moveTo(cx, top - 2); context.lineTo(cx, top + 9); context.stroke();
      context.fillStyle = '#547444'; context.fillRect(cx - 1, top - 1, 2, 3);
    } else if (style === 'scarf') {
      const scarf = context.createLinearGradient(cx - width * 0.36, cy + 2, cx + width * 0.36, cy + height * 0.35);
      scarf.addColorStop(0, '#e77a97'); scarf.addColorStop(1, '#8f365f'); context.fillStyle = scarf;
      context.beginPath(); context.roundRect(cx - width * 0.37, cy + 2, width * 0.74, height * 0.16, 3); context.fill();
      context.beginPath(); context.moveTo(cx + width * 0.17, cy + 5); context.lineTo(cx + width * 0.31, cy + 5); context.lineTo(cx + width * 0.25, cy + height * 0.32); context.lineTo(cx + width * 0.12, cy + height * 0.28); context.closePath(); context.fill();
    } else if (style === 'headphones') {
      drawHeadsetBand(cx, top, width, 1); drawHeadsetCups(cx, cy, width, 1);
    }
  }

  function drawOutfitFace(cx, cy, width, height, outfitId) {
    if (outfitId === 'space-knight') {
      const maskTop = cy + height * 0.13;
      const mask = context.createLinearGradient(cx - width * 0.2, maskTop, cx + width * 0.2, maskTop + height * 0.26);
      mask.addColorStop(0, '#545860'); mask.addColorStop(0.45, '#191b20'); mask.addColorStop(1, '#08090b');
      context.fillStyle = mask; context.beginPath(); context.moveTo(cx - width * 0.28, maskTop);
      context.lineTo(cx + width * 0.28, maskTop); context.lineTo(cx + width * 0.19, maskTop + height * 0.25);
      context.lineTo(cx, maskTop + height * 0.31); context.lineTo(cx - width * 0.19, maskTop + height * 0.25); context.closePath(); context.fill();
      context.fillStyle = '#b9bec7'; context.beginPath(); context.moveTo(cx, maskTop + 2); context.lineTo(cx - 2.2, maskTop + 6); context.lineTo(cx + 2.2, maskTop + 6); context.closePath(); context.fill();
      context.strokeStyle = '#b9bec7'; context.lineWidth = 0.7;
      for (let offset = -2; offset <= 2; offset += 1) { context.beginPath(); context.moveTo(cx + offset * 2, maskTop + 7); context.lineTo(cx + offset * 2, maskTop + 10); context.stroke(); }
      context.fillStyle = '#d94c4c'; context.fillRect(cx - width * 0.22, maskTop + 3, 2, 1.6);
      context.fillStyle = '#5b91c6'; context.fillRect(cx + width * 0.2, maskTop + 3, 2, 1.6);
    } else if (outfitId === 'rock-star') {
      const y = cy + height * 0.14;
      context.fillStyle = '#211b18'; context.beginPath(); context.moveTo(cx - 8, y + 1); context.quadraticCurveTo(cx - 4, y - 1, cx - 1, y + 1);
      context.lineTo(cx, y + 2); context.lineTo(cx + 1, y + 1); context.quadraticCurveTo(cx + 4, y - 1, cx + 8, y + 1);
      context.lineTo(cx + 6, y + 4); context.lineTo(cx + 1, y + 3); context.lineTo(cx, y + 4);
      context.lineTo(cx - 1, y + 3); context.lineTo(cx - 6, y + 4); context.closePath(); context.fill();
    }
  }

  function drawHeart(cx, cy, size, alpha = 1) {
    if (alpha < 0.02) return;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#ef91aa';
    context.beginPath();
    context.moveTo(cx, cy + size * 0.46);
    context.bezierCurveTo(cx - size * 1.35, cy - size * 0.25, cx - size * 0.68, cy - size * 1.05, cx, cy - size * 0.52);
    context.bezierCurveTo(cx + size * 0.68, cy - size * 1.05, cx + size * 1.35, cy - size * 0.25, cx, cy + size * 0.46);
    context.fill();
    context.restore();
  }

  function drawSpark(cx, cy, size, alpha = 1, rotation = 0) {
    if (alpha < 0.02) return;
    context.save();
    context.globalAlpha = alpha;
    context.translate(cx, cy);
    context.rotate(rotation);
    context.strokeStyle = '#f5df9c';
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(0, -size); context.lineTo(0, size);
    context.moveTo(-size, 0); context.lineTo(size, 0);
    context.stroke();
    context.restore();
  }

  return { getEmotionColor, getShellGradientColors, getShellOutlineColor, getBaseHighlightAlpha, mixHexColors, drawHeadsetBand, drawHeadsetCups, drawOutfit, drawHair, drawAccessory, drawOutfitFace, drawHeart, drawSpark, setBaseColor };
}

window.PipPetGraphics = { createPetGraphics };
