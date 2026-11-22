(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Heavy13 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var COLORS = ["R", "G", "B"];
  var COLOR_KO = { R: "빨강", G: "초록", B: "파랑", W: "레인보우" };
  var PLAYER_COUNT = 7;
  var ROUNDS = 14;
  var LIMIT = 13;

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dealKit() {
    return {
      cards: [0, 1, 2, 3, 4, 5, 6],
      chips: ["R", "R", "G", "G", "B", "B", "W"],
    };
  }

  function emptyPedestals() {
    return {
      R: { cubes: [] },
      G: { cubes: [] },
      B: { cubes: [] },
    };
  }

  function pedestalSum(p) {
    return p.cubes.reduce(function (a, c) {
      return a + c.value;
    }, 0);
  }

  function playerNames(humanCount) {
    if (humanCount === 2) {
      return ["P1", "P2", "CPU1", "CPU2", "CPU3", "CPU4", "CPU5"];
    }
    return ["나", "CPU1", "CPU2", "CPU3", "CPU4", "CPU5", "CPU6"];
  }

  function createGame(opts) {
    opts = opts || {};
    var humanCount = opts.humanCount === 2 ? 2 : 1;
    var seed = opts.seed == null ? Date.now() : opts.seed;
    var names = playerNames(humanCount);
    var players = [];
    for (var i = 0; i < PLAYER_COUNT; i++) {
      var kit = dealKit();
      players.push({
        id: i,
        name: names[i],
        isHuman: i < humanCount,
        cards: kit.cards.slice(),
        chips: kit.chips.slice(),
        penalty: 0,
        lastPenaltyRound: -1,
        lastPenaltySeq: -1,
      });
    }
    return {
      seed: seed,
      rng: null,
      rngState: seed,
      humanCount: humanCount,
      round: 1,
      dealer: opts.dealer != null ? opts.dealer : (seed >>> 0) % PLAYER_COUNT,
      penaltyClock: 0,
      players: players,
      pedestals: emptyPedestals(),
      submissions: {},
      phase: "submit",
      placeQueue: [],
      passQueue: [],
      lastPenaltyPlayer: null,
      events: [],
      log: [],
      winnerIds: [],
    };
  }

  function attachRng(state) {
    if (!state._rand) state._rand = mulberry32(state.rngState || 1);
    return state._rand;
  }

  function log(state, text) {
    state.log.push({ round: state.round, text: text });
    if (state.log.length > 80) state.log.shift();
  }

  function remainingHumans(state) {
    return state.players.filter(function (p) {
      return p.isHuman && state.submissions[p.id] == null;
    });
  }

  function canSubmit(player, card, chip) {
    if (player.cards.indexOf(card) < 0) return "그 카드가 없습니다.";
    if (player.chips.indexOf(chip) < 0) return "그 칩이 없습니다.";
    if (chip !== "W" && COLORS.indexOf(chip) < 0) return "칩 색이 잘못됐습니다.";
    return null;
  }

  function submit(state, playerId, card, chip) {
    if (state.phase !== "submit") throw new Error("submit phase가 아닙니다.");
    var player = state.players[playerId];
    if (!player) throw new Error("없는 플레이어");
    if (state.submissions[playerId]) throw new Error("이미 제출했습니다.");
    var err = canSubmit(player, card, chip);
    if (err) throw new Error(err);
    player.cards.splice(player.cards.indexOf(card), 1);
    player.chips.splice(player.chips.indexOf(chip), 1);
    state.submissions[playerId] = {
      playerId: playerId,
      card: card,
      chip: chip,
      passed: false,
      placed: false,
      chosenColor: chip === "W" ? null : chip,
    };
    state.events.push({ type: "submit", playerId: playerId, card: card, chip: chip });
    return state;
  }

  function allSubmitted(state) {
    return Object.keys(state.submissions).length === PLAYER_COUNT;
  }

  function clockwiseRank(id, dealer) {
    return (id - dealer + PLAYER_COUNT) % PLAYER_COUNT;
  }

  function placementOrder(state) {
    var list = [];
    for (var i = 0; i < PLAYER_COUNT; i++) list.push(state.submissions[i]);
    list.sort(function (a, b) {
      var ar = a.chip === "W" ? 0 : 1;
      var br = b.chip === "W" ? 0 : 1;
      if (ar !== br) return ar - br;
      if (b.card !== a.card) return b.card - a.card;
      return clockwiseRank(a.playerId, state.dealer) - clockwiseRank(b.playerId, state.dealer);
    });
    return list.map(function (s) {
      return s.playerId;
    });
  }

  function beginReveal(state) {
    if (!allSubmitted(state)) throw new Error("아직 제출이 끝나지 않았습니다.");
    state.phase = "reveal";
    state.placeQueue = placementOrder(state);
    state.passQueue = [];
    state.passActivated = false;
    state.events.push({ type: "reveal", order: state.placeQueue.slice() });
    log(state, "칩과 카드를 공개합니다.");
    return state;
  }

  function beginPlace(state) {
    state.phase = "place";
    return state;
  }

  function currentActor(state) {
    if (state.phase !== "place") return null;
    if (state.placeQueue.length) return state.placeQueue[0];
    if (state.passQueue.length) return state.passQueue[0];
    return null;
  }

  function placeCube(state, playerId, color) {
    var sub = state.submissions[playerId];
    var ped = state.pedestals[color];
    var cube = { value: sub.card, owner: playerId };
    var beforeCount = ped.cubes.length;
    var beforeSum = pedestalSum(ped);
    var after = beforeSum + cube.value;
    var overflowed = after >= LIMIT;
    if (overflowed) {
      var penalty = beforeCount;
      state.penaltyClock = (state.penaltyClock || 0) + 1;
      state.players[playerId].penalty += penalty;
      state.players[playerId].lastPenaltyRound = state.round;
      state.players[playerId].lastPenaltySeq = state.penaltyClock;
      state.lastPenaltyPlayer = playerId;
      ped.cubes = [cube];
      state.events.push({
        type: "overflow",
        playerId: playerId,
        color: color,
        penalty: penalty,
        card: sub.card,
      });
      log(
        state,
        state.players[playerId].name +
          " → " +
          COLOR_KO[color] +
          " " +
          sub.card +
          " · 합 " +
          beforeSum +
          "→" +
          after +
          " · 벌점 +" +
          penalty
      );
    } else {
      ped.cubes.push(cube);
      state.events.push({
        type: "place",
        playerId: playerId,
        color: color,
        card: sub.card,
        sum: after,
      });
      log(
        state,
        state.players[playerId].name +
          " → " +
          COLOR_KO[color] +
          " " +
          sub.card +
          " · 합 " +
          after
      );
    }
    sub.placed = true;
    sub.chosenColor = color;
  }

  function passTurn(state, playerId) {
    if (state.phase !== "place") throw new Error("배치 단계가 아닙니다.");
    if (state.placeQueue[0] !== playerId) throw new Error("지금 패스할 차례가 아닙니다.");
    var sub = state.submissions[playerId];
    if (sub.passed) throw new Error("이번 라운드에 이미 패스했습니다.");
    sub.passed = true;
    state.placeQueue.shift();
    state.passQueue.push(playerId);
    state.events.push({ type: "pass", playerId: playerId });
    log(state, state.players[playerId].name + " 패스");
    activatePassers(state);
    return finishIfPlaced(state);
  }

  function placeNow(state, playerId, color) {
    if (state.phase !== "place") throw new Error("배치 단계가 아닙니다.");
    var actor = currentActor(state);
    if (actor !== playerId) throw new Error("지금 배치할 차례가 아닙니다.");
    var sub = state.submissions[playerId];
    if (sub.placed) throw new Error("이미 배치했습니다.");
    var use = color;
    if (sub.chip === "W") {
      if (COLORS.indexOf(use) < 0) throw new Error("레인보우는 색을 골라야 합니다.");
    } else {
      use = sub.chip;
    }
    placeCube(state, playerId, use);
    if (state.placeQueue[0] === playerId) state.placeQueue.shift();
    else if (state.passQueue[0] === playerId) state.passQueue.shift();
    activatePassers(state);
    return finishIfPlaced(state);
  }

  function activatePassers(state) {
    if (state.placeQueue.length === 0 && state.passQueue.length && !state.passActivated) {
      state.passQueue.reverse();
      state.passActivated = true;
    }
  }

  function ranking(state) {
    var rows = state.players.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        penalty: p.penalty,
        lastPenaltyRound: p.lastPenaltyRound,
        lastPenaltySeq: p.lastPenaltySeq,
      };
    });
    rows.sort(function (a, b) {
      if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      return a.lastPenaltySeq - b.lastPenaltySeq;
    });
    return rows;
  }

  function refill(state) {
    for (var i = 0; i < state.players.length; i++) {
      var kit = dealKit();
      state.players[i].cards = kit.cards.slice();
      state.players[i].chips = kit.chips.slice();
    }
    state.events.push({ type: "refill", round: state.round });
    log(state, "카드와 칩을 다시 지급합니다. 받침대는 그대로입니다.");
  }

  function endRound(state) {
    if (state.lastPenaltyPlayer != null) state.dealer = state.lastPenaltyPlayer;
    state.lastPenaltyPlayer = null;
    state.submissions = {};
    state.placeQueue = [];
    state.passQueue = [];
    if (state.round === 7) refill(state);
    if (state.round >= ROUNDS) {
      state.phase = "gameover";
      var ranked = ranking(state);
      state.winnerIds = ranked
        .filter(function (r) {
          return r.penalty === ranked[0].penalty && r.lastPenaltySeq === ranked[0].lastPenaltySeq;
        })
        .map(function (r) {
          return r.id;
        });
      state.events.push({ type: "gameover", ranking: ranking(state) });
      log(state, "14라운드 종료");
      return state;
    }
    state.round += 1;
    state.phase = "submit";
    state.events.push({ type: "round", round: state.round, dealer: state.dealer });
    log(state, state.round + "라운드 · 선 " + state.players[state.dealer].name);
    return state;
  }

  function finishIfPlaced(state) {
    var pending = state.players.some(function (p) {
      return !state.submissions[p.id].placed;
    });
    if (pending) return state;
    return endRound(state);
  }

  function snapshotPublic(state) {
    var subs = null;
    if (state.phase !== "submit") {
      subs = {};
      Object.keys(state.submissions).forEach(function (k) {
        var s = state.submissions[k];
        subs[k] = {
          playerId: s.playerId,
          card: s.card,
          chip: s.chip,
          passed: s.passed,
          placed: s.placed,
          chosenColor: s.chosenColor,
        };
      });
    } else {
      subs = {};
      Object.keys(state.submissions).forEach(function (k) {
        subs[k] = { playerId: Number(k), done: true };
      });
    }
    return {
      round: state.round,
      dealer: state.dealer,
      phase: state.phase,
      humanCount: state.humanCount,
      actor: currentActor(state),
      pedestals: clone(state.pedestals),
      players: state.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          isHuman: p.isHuman,
          penalty: p.penalty,
          lastPenaltyRound: p.lastPenaltyRound,
          lastPenaltySeq: p.lastPenaltySeq,
          cards: p.cards.slice(),
          chips: p.chips.slice(),
          submitted: !!state.submissions[p.id],
        };
      }),
      submissions: subs,
      placeQueue: state.placeQueue.slice(),
      passQueue: state.passQueue.slice(),
      log: state.log.slice(-12),
      ranking: state.phase === "gameover" ? ranking(state) : null,
    };
  }

  function pedestalInfo(state, color) {
    var p = state.pedestals[color];
    return { color: color, cubes: p.cubes.slice(), sum: pedestalSum(p), slack: LIMIT - pedestalSum(p) };
  }

  return {
    COLORS: COLORS,
    COLOR_KO: COLOR_KO,
    PLAYER_COUNT: PLAYER_COUNT,
    ROUNDS: ROUNDS,
    LIMIT: LIMIT,
    createGame: createGame,
    attachRng: attachRng,
    submit: submit,
    canSubmit: canSubmit,
    allSubmitted: allSubmitted,
    remainingHumans: remainingHumans,
    beginReveal: beginReveal,
    beginPlace: beginPlace,
    currentActor: currentActor,
    passTurn: passTurn,
    placeNow: placeNow,
    ranking: ranking,
    snapshotPublic: snapshotPublic,
    pedestalSum: pedestalSum,
    pedestalInfo: pedestalInfo,
    placementOrder: placementOrder,
    clockwiseRank: clockwiseRank,
  };
});
