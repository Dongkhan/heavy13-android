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

  function pickCardForSlack(cards, sl) {
    var fit = cards.filter(function (c) {
      return c < sl;
    });
    if (fit.length) return fit[fit.length - 1];
    if (cards.indexOf(0) >= 0) return 0;
    return Math.min.apply(null, cards);
  }

  function chooseSubmit(state, playerId) {
    var p = state.players[playerId];
    var cards = p.cards.slice().sort(function (a, b) {
      return a - b;
    });
    var chips = p.chips.slice();
    var round = state.round;
    var hasW = chips.indexOf("W") >= 0;
    var colors = H.COLORS.filter(function (c) {
      return chips.indexOf(c) >= 0;
    });

    var ranked = colors
      .map(function (c) {
        return { color: c, slack: slack(state, c), cubes: cubeCount(state, c) };
      })
      .sort(function (a, b) {
        if (b.slack !== a.slack) return b.slack - a.slack;
        return a.cubes - b.cubes;
      });

    var late = round % 7 >= 5 || round >= 12;
    var desperate = ranked.length === 0 || (ranked[0] && ranked[0].slack <= 1 && cards[0] > 0);

    if (hasW && (desperate || (late && rand(state) < 0.45))) {
      var card = late && cards.indexOf(0) >= 0 && rand(state) < 0.5 ? 0 : pickCardForSlack(cards, 7);
      return { card: card, chip: "W" };
    }

    var target = ranked[0] || { color: colors[0] || "R", slack: 6 };
    var card2 = pickCardForSlack(cards, target.slack);
    var chip = target.color;
    if (chips.indexOf(chip) < 0) {
      if (hasW) return { card: card2, chip: "W" };
      chip = chips[0];
    }
    if (card2 >= target.slack && cards.indexOf(0) >= 0 && rand(state) < 0.7) card2 = 0;
    return { card: card2, chip: chip };
  }

  function safestColor(state, card) {
    var opts = H.COLORS.map(function (c) {
      var sl = slack(state, c);
      var overflow = card + H.pedestalSum(state.pedestals[c]) >= H.LIMIT;
      return {
        color: c,
        slack: sl,
        overflow: overflow,
        cubes: cubeCount(state, c),
      };
    });
    var safe = opts.filter(function (o) {
      return !o.overflow;
    });
    if (safe.length) {
      safe.sort(function (a, b) {
        return b.slack - a.slack;
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
    if (sub.chip === "W") {
      color = safestColor(state, sub.card);
    }
    return { pass: false, color: color };
  }

  return { chooseSubmit: chooseSubmit, choosePlace: choosePlace, safestColor: safestColor };
});
