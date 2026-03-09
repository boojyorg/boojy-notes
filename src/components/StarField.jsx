import { useEffect, useRef } from "react";
import { mulberry32, hashString } from "../utils/random";

const StarField = ({ mode = "empty", seed = "__default__" }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Kill any previous animation loop
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    // Force-clear the canvas by resetting dimensions
    const w = parent.clientWidth;
    const h = Math.max(parent.scrollHeight, parent.clientHeight);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Star generation: density-based, grows as content grows
    const colours = [
      "#FFFFFF",
      "#FFFFFF",
      "#FFFFFF",
      "#FFFFFF",
      "#FFFFFF",
      "#FFFFFF",
      "#FFFFFF",
      "#FFFFFF",
      "#F0F4FF",
      "#FFFDDE",
    ];
    const starsPerScreen = mode === "empty" ? 220 : 110;
    // Reference width used to calibrate density — starsPerScreen assumes this width
    const REF_WIDTH = 800;
    // Fixed pixel offset to avoid the title/toolbar area
    const topExcludePx = mode === "empty" ? 30 : 60;
    const stars = [];
    let coveredHeight = 0;
    let coveredWidth = 0;

    const generateStarsForBand = (yFrom, yTo, width) => {
      const bandHeight = yTo - yFrom;
      const viewportH = parent.clientHeight || 800;
      // Scale count with both height and width so density stays consistent
      const count = Math.round(starsPerScreen * (bandHeight / viewportH) * (width / REF_WIDTH));
      // Use a seed derived from the band start so stars are stable per region
      const bandRand = mulberry32(hashString(seed) + Math.round(yFrom));
      for (let i = 0; i < count; i++) {
        const isHero = bandRand() < 0.08;
        const radius = isHero ? 1.5 + bandRand() * 1.0 : 0.3 + bandRand() * 1.2;
        stars.push({
          x: bandRand() * width,
          y: yFrom + bandRand() * bandHeight,
          radius,
          color: colours[Math.floor(bandRand() * colours.length)],
          maxBrightness: 0.3 + bandRand() * 0.7,
          cycleDuration: 30000 + bandRand() * 120000,
          phaseOffset: bandRand() * Math.PI * 2,
          shadowBlur: radius > 1.0 ? 8 + radius * 5 : 4 + radius * 3,
        });
      }
    };

    // Initial generation
    generateStarsForBand(topExcludePx, h, w);
    coveredHeight = h;
    coveredWidth = w;

    const resize = () => {
      const rw = parent.clientWidth;
      const rh = Math.max(parent.scrollHeight, parent.clientHeight);
      canvas.width = rw * dpr;
      canvas.height = rh * dpr;
      canvas.style.width = rw + "px";
      canvas.style.height = rh + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const emptyMult = mode === "empty" ? 1.6 : 1.0;
    const draw = (time) => {
      const cw = parent.clientWidth;
      const ch = Math.max(parent.scrollHeight, parent.clientHeight);

      // Regenerate all stars if width grew (e.g. parent laid out late or window resized)
      if (cw > coveredWidth + 1) {
        stars.length = 0;
        coveredHeight = 0;
        generateStarsForBand(topExcludePx, ch, cw);
        coveredHeight = ch;
        coveredWidth = cw;
      }
      // Add stars for new vertical area if content grew taller
      if (ch > coveredHeight + 1) {
        generateStarsForBand(coveredHeight, ch, cw);
        coveredHeight = ch;
      }
      if (Math.abs(ch - canvas.clientHeight) > 1) {
        canvas.height = ch * dpr;
        canvas.style.height = ch + "px";
      }

      // Full-buffer clear: reset transform, clear raw pixels, restore
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      for (const s of stars) {
        if (s.x > cw || s.y > ch) continue;
        const cycle = (time % s.cycleDuration) / s.cycleDuration;
        const sine = Math.sin(cycle * Math.PI * 2 + s.phaseOffset);
        const norm = (sine + 1) / 2;
        const opacity = Math.min((0.08 + norm * (s.maxBrightness - 0.08)) * emptyMult, 1.0);

        ctx.globalAlpha = opacity;
        ctx.fillStyle = s.color;
        if (s.radius > 1.0) {
          ctx.shadowBlur = s.shadowBlur * (0.6 + norm * 0.4);
          ctx.shadowColor = s.color;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
        if (s.radius > 1.0) ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      window.removeEventListener("resize", resize);
      ro.disconnect();
      // Nuke canvas content
      canvas.width = canvas.width; // eslint-disable-line no-self-assign -- intentional canvas clear
    };
  }, [mode, seed]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};

export default StarField;
