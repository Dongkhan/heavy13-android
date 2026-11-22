(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.Heavy13AI = factory(root.Heavy13);
  }
})(typeof self !== "undefined" ? self : this, function (H) {
  "use strict";

  function slack(state, color) {
    return H.LIMIT - H.pedestalSum(state.pedestals[color]);
  }

  function cubeCount(state, color) {
    return state.pedestals[color].cubes.length;
  }

  function rand(state) {
    return H.attachRng(state)();
  }

  function submittedCounts(state) {
    var used = { R: 0, G: 0, B: 0, W: 0 };
    Object.keys(state.submissions).forEach(function (k) {
      var ch = state.submissions[k].chip;
      if (used[ch] != null) used[ch] += 1;
    });
    return used;
  }

  function pickCard(cards, sl, half, r) {
    var sorted = cards.slice().sort(function (a, b) {
      return a - b;
    });
    var fit = sorted.filter(function (c) {
      return c < sl;
    });
    var pool = fit.length ? fit : sorted;
    if (half <= 2) {
      var mid = pool.filter(function (c) {
        return c >= 2 && c <= 5;
      });
      if (mid.length) return mid[Math.floor(r * mid.length)];
    }
    if (half >= 5 && sl <= 4 && pool.indexOf(0) >= 0) return 0;
    if (pool.length >= 2 && r < 0.45) return pool[pool.length - 2];
    return pool[pool.length - 1];
  }

  function chooseSubmit(state, playerId) {
    var p = state.players[playerId];
    var cards = p.cards.slice().sort(function (a, b) {
      return a - b;
    });
    var chips = p.chips.slice();
    var round = state.round;
    var half = (round - 1) % 7;
    var hasW = chips.indexOf("W") >= 0;
    var colors = H.COLORS.filter(function (c) {
      return chips.indexOf(c) >= 0;
    });
    var used = submittedCounts(state);

    function colorScore(c) {
      var prefer = (playerId + round) % 3 === H.COLORS.indexOf(c) ? 2.8 : 0;
      return slack(state, c) - used[c] * 5.5 - cubeCount(state, c) * 0.5 + prefer + rand(state) * 2.4;
    }

    var ranked = colors
      .map(function (c) {
        return { color: c, slack: slack(state, c), score: colorScore(c) };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });

    var desperate = ranked.length === 0 || (ranked[0] && ranked[0].slack <= 1 && cards[0] > 0);
    var late = half >= 5 || round >= 12;

    if (hasW && (desperate || (late && rand(state) < 0.32))) {
      return { card: pickCard(cards, 7, half, rand(state)), chip: "W" };
    }

    var target = ranked[0] || { color: colors[0] || H.COLORS[playerId % 3], slack: 6 };
    var card = pickCard(cards, target.slack, half, rand(state));
    var chip = target.color;
    if (chips.indexOf(chip) < 0) {
      if (hasW) return { card: card, chip: "W" };
      chip = chips[0];
    }
    if (card >= target.slack && cards.indexOf(0) >= 0 && rand(state) < 0.75) card = 0;
    return { card: card, chip: chip };
  }

  function safestColor(state, card) {
    var used = submittedCounts(state);
    var opts = H.COLORS.map(function (c) {
      var overflow = card + H.pedestalSum(state.pedestals[c]) >= H.LIMIT;
      return {
        color: c,
        slack: slack(state, c),
        overflow: overflow,
        cubes: cubeCount(state, c),
        pile: used[c],
      };
    });
    var safe = opts.filter(function (o) {
      return !o.overflow;
    });
    if (safe.length) {
      safe.sort(function (a, b) {
        if (b.slack !== a.slack) return b.slack - a.slack;
        return a.pile - b.pile;
      });
      return safe[0].color;
    }
    opts.sort(function (a, b) {
      return a.cubes - b.cubes;
    });
    return opts[0].color;
  }

  function wouldOverflow(state, color, card) {
    return H.pedestalSum(state.pedestals[color]) + card >= H.LIMIT;
  }

  function choosePlace(state, playerId) {
    var sub = state.submissions[playerId];
    var inMain = state.placeQueue[0] === playerId;
    var color = sub.chip === "W" ? safestColor(state, sub.card) : sub.chip;
    var overflow = wouldOverflow(state, color, sub.card);
    if (inMain && !sub.passed && overflow && sub.card > 0) {
      return { pass: true };
    }
    if (sub.chip === "W") color = safestColor(state, sub.card);
    return { pass: false, color: color };
  }

  return { chooseSubmit: chooseSubmit, choosePlace: choosePlace, safestColor: safestColor };
});
