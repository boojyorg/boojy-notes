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
    const h = parent.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Generate stars for this seed
    const rand = mulberry32(hashString(seed));
    const count = mode === "empty" ? 220 : 110;
    const topExclude = mode === "empty" ? 0.05 : 0.12;
    const colours = ["#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#F0F4FF","#FFFDDE"];
    const stars = Array.from({ length: count }, () => {
      const isHero = rand() < 0.08;
      const radius = isHero ? 1.5 + rand() * 1.0 : 0.3 + rand() * 1.2;
      return {
        x: rand() * w,
        y: h * topExclude + rand() * h * (1 - topExclude),
        radius,
        color: colours[Math.floor(rand() * colours.length)],
        maxBrightness: 0.3 + rand() * 0.7,
        cycleDuration: 30000 + rand() * 120000,
        phaseOffset: rand() * Math.PI * 2,
        shadowBlur: radius > 1.0 ? 8 + radius * 5 : 4 + radius * 3,
      };
    });

    const resize = () => {
      const rw = parent.clientWidth;
      const rh = parent.clientHeight;
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
      const ch = parent.clientHeight;
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
      canvas.width = canvas.width;
    };
  }, [mode, seed]);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0,
      pointerEvents: "none", zIndex: 0,
    }} />
  );
};

export default StarField;
