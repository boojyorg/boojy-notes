import { memo, useEffect, useRef } from "react";
import { mulberry32, hashString } from "../utils/random";
import { Z } from "../constants/zIndex";

const StarField = ({ mode = "empty", seed = "__default__" }) => {
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Cached layout dimensions — only updated in resize handler
    let cachedW = parent.clientWidth;
    let cachedH = parent.clientHeight;

    const setCanvasSize = () => {
      canvas.width = cachedW * dpr;
      canvas.height = cachedH * dpr;
      canvas.style.width = cachedW + "px";
      canvas.style.height = cachedH + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setCanvasSize();

    // Star generation
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
    const REF_WIDTH = 800;
    const topExcludePx = mode === "empty" ? 30 : 60;
    let stars = [];

    const generateStars = (w, h) => {
      stars = [];
      const viewportH = h || 800;
      const count = Math.round(starsPerScreen * ((h - topExcludePx) / viewportH) * (w / REF_WIDTH));
      const rand = mulberry32(hashString(seed));
      for (let i = 0; i < count; i++) {
        const isHero = rand() < 0.08;
        const radius = isHero ? 1.5 + rand() * 1.0 : 0.3 + rand() * 1.2;
        stars.push({
          x: rand() * w,
          y: topExcludePx + rand() * (h - topExcludePx),
          radius,
          color: colours[Math.floor(rand() * colours.length)],
          maxBrightness: 0.3 + rand() * 0.7,
          cycleDuration: 30000 + rand() * 120000,
          phaseOffset: rand() * Math.PI * 2,
        });
      }
    };

    generateStars(cachedW, cachedH);

    const emptyMult = mode === "empty" ? 1.6 : 1.0;

    const draw = () => {
      const time = performance.now();

      // Full-buffer clear
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      for (const s of stars) {
        if (s.x > cachedW || s.y > cachedH) continue;
        const cycle = (time % s.cycleDuration) / s.cycleDuration;
        const sine = Math.sin(cycle * Math.PI * 2 + s.phaseOffset);
        const norm = (sine + 1) / 2;
        const opacity = Math.min((0.08 + norm * (s.maxBrightness - 0.08)) * emptyMult, 1.0);

        ctx.globalAlpha = opacity;
        ctx.fillStyle = s.color;

        // Cheap two-circle glow for hero stars (replaces expensive shadowBlur)
        if (s.radius > 1.0) {
          ctx.globalAlpha = opacity * 0.15;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = opacity;
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // Initial draw
    draw();

    // Re-draw every 5 seconds for subtle twinkle updates
    intervalRef.current = setInterval(draw, 5000);

    // Debounced resize handler
    let resizeTimer = null;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        cachedW = parent.clientWidth;
        cachedH = parent.clientHeight;
        setCanvasSize();
        generateStars(cachedW, cachedH);
        draw();
      }, 200);
    };

    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(parent);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
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
        zIndex: Z.STARFIELD,
      }}
    />
  );
};

export default memo(StarField);
