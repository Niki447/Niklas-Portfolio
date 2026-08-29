(function () {
  "use strict";

  var root = document.documentElement;

  // Cursor-follow spotlight (fine pointers only, respects reduced motion)
  var fine = window.matchMedia("(pointer: fine)").matches;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (fine && !reduceMotion) {
    var raf = null;
    var tx = 50, ty = 25;
    var apply = function () {
      root.style.setProperty("--mx", tx + "%");
      root.style.setProperty("--my", ty + "%");
      raf = null;
    };
    window.addEventListener(
      "mousemove",
      function (e) {
        tx = ((e.clientX / window.innerWidth) * 100).toFixed(2);
        ty = ((e.clientY / window.innerHeight) * 100).toFixed(2);
        if (!raf) raf = requestAnimationFrame(apply);
      },
      { passive: true }
    );
  }

  // Scroll reveal
  var revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && revealEls.length && !reduceMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 80 + "ms";
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  // Terminal-style typewriter
  document.querySelectorAll("[data-typed]").forEach(function (el) {
    if (reduceMotion) {
      var list;
      try {
        list = JSON.parse(el.getAttribute("data-typed"));
      } catch (e) {
        return;
      }
      el.textContent = list[0] || "";
      return;
    }
    var words;
    try {
      words = JSON.parse(el.getAttribute("data-typed"));
    } catch (e) {
      return;
    }
    if (!words || !words.length) return;
    var wi = 0, ci = 0, deleting = false;
    var tick = function () {
      var word = words[wi];
      if (!deleting) {
        ci++;
        el.textContent = word.slice(0, ci);
        if (ci === word.length) {
          deleting = true;
          setTimeout(tick, 1400);
          return;
        }
      } else {
        ci--;
        el.textContent = word.slice(0, ci);
        if (ci === 0) {
          deleting = false;
          wi = (wi + 1) % words.length;
        }
      }
      setTimeout(tick, deleting ? 40 : 70);
    };
    tick();
  });

  // Footer year
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Mobile nav toggle
  document.querySelectorAll(".nav-toggle").forEach(function (btn) {
    var nav = btn.parentElement.querySelector(".main-nav");
    if (!nav) return;
    btn.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      });
    });
  });
})();
