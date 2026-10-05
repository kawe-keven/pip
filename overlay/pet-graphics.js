function createPetGraphics(context, emotionColors) {
  function getEmotionColor(emotion) {
    const base = [212, 215, 212];
    const total = Object.values(emotion).reduce((sum, value) => sum + value, 0);
    const mix = Math.min(1, total);
    const color = base.map((value, channel) => {
      const weighted = Object.entries(emotion).reduce((sum, [name, weight]) => {
        const hex = emotionColors[name].slice(1);
        return sum + parseInt(hex.slice(channel * 2, channel * 2 + 2), 16) * weight;
      }, 0);
      return Math.round(value * (1 - mix) + (total ? weighted / total : value) * mix);
    });
    return `rgb(${color.join(',')})`;
  }

  function mixHexColors(from, to, amount) {
    const start = from.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
    const end = to.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
    return `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * amount)).join(',')})`;
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

  return { getEmotionColor, mixHexColors, drawHeadsetBand, drawHeadsetCups, drawHeart, drawSpark };
}

window.PipPetGraphics = { createPetGraphics };
