"use strict";
var assert = require("assert");
var path = require("path");
var H = require(path.join(__dirname, "../play/js/engine.js"));
var AI = require(path.join(__dirname, "../play/js/ai.js"));

function fail(msg) {
  throw new Error(msg);
}

function playRoundCpu(state) {
  var pending = [];
  state.players.forEach(function (p) {
    if (state.submissions[p.id]) return;
    pending.push({ id: p.id, choice: AI.chooseSubmit(state, p.id) });
  });
  pending.forEach(function (x) {
    H.submit(state, x.id, x.choice.card, x.choice.chip);
  });
  H.beginReveal(state);
  H.beginPlace(state);
  var guard = 0;
  while (state.phase === "place") {
    var id = H.currentActor(state);
    if (id == null) fail("actor null while placing");
    var act = AI.choosePlace(state, id);
    if (act.pass) H.passTurn(state, id);
    else H.placeNow(state, id, act.color);
    if (++guard > 40) fail("placement loop");
  }
}

var tests = 0;
function t(name, fn) {
  fn();
  tests += 1;
  console.log("ok", name);
}

t("overflow collects previous cube count, new cube stays", function () {
  var s = H.createGame({ humanCount: 1, seed: 1 });
  s.pedestals.R.cubes = [
    { value: 6, owner: 1 },
    { value: 6, owner: 2 },
  ];
  s.players.forEach(function (p, i) {
    H.submit(s, i, p.cards[0], i === 0 ? "R" : p.chips[0]);
  });
  // rewrite submission 0 to card 1 red
  s.submissions[0].card = 1;
  s.submissions[0].chip = "R";
  s.phase = "place";
  s.placeQueue = [0];
  s.passQueue = [];
  s.passActivated = false;
  // fake others as already placed
  for (var i = 1; i < 7; i++) s.submissions[i].placed = true;
  H.placeNow(s, 0, "R");
  assert.strictEqual(s.players[0].penalty, 2);
  assert.strictEqual(s.pedestals.R.cubes.length, 1);
  assert.strictEqual(s.pedestals.R.cubes[0].value, 1);
});

t("0 never overflows", function () {
  var s = H.createGame({ humanCount: 1, seed: 1 });
  s.pedestals.G.cubes = [
    { value: 6, owner: 1 },
    { value: 6, owner: 2 },
  ];
  s.players.forEach(function (p, i) {
    H.submit(s, i, 0, i === 0 ? "G" : "R");
  });
  for (var i = 1; i < 7; i++) s.submissions[i].placed = true;
  s.phase = "place";
  s.placeQueue = [0];
  s.passQueue = [];
  H.placeNow(s, 0, "G");
  assert.strictEqual(s.players[0].penalty, 0);
  assert.strictEqual(s.pedestals.G.cubes.length, 3);
  assert.strictEqual(H.pedestalSum(s.pedestals.G), 12);
});

t("rainbow beats a 6", function () {
  var s = H.createGame({ humanCount: 1, seed: 1 });
  s.dealer = 3;
  s.submissions = {
    0: { playerId: 0, card: 0, chip: "W", passed: false, placed: false, chosenColor: null },
    1: { playerId: 1, card: 6, chip: "R", passed: false, placed: false, chosenColor: "R" },
    2: { playerId: 2, card: 5, chip: "G", passed: false, placed: false, chosenColor: "G" },
    3: { playerId: 3, card: 4, chip: "B", passed: false, placed: false, chosenColor: "B" },
    4: { playerId: 4, card: 3, chip: "R", passed: false, placed: false, chosenColor: "R" },
    5: { playerId: 5, card: 2, chip: "G", passed: false, placed: false, chosenColor: "G" },
    6: { playerId: 6, card: 1, chip: "B", passed: false, placed: false, chosenColor: "B" },
  };
  var order = H.placementOrder(s);
  assert.strictEqual(order[0], 0);
  assert.strictEqual(order[1], 1);
});

t("same number goes clockwise from dealer", function () {
  var s = H.createGame({ humanCount: 1, seed: 1 });
  s.dealer = 5;
  s.submissions = {
    0: { playerId: 0, card: 4, chip: "R", passed: false, placed: false, chosenColor: "R" },
    1: { playerId: 1, card: 4, chip: "G", passed: false, placed: false, chosenColor: "G" },
    2: { playerId: 2, card: 3, chip: "B", passed: false, placed: false, chosenColor: "B" },
    3: { playerId: 3, card: 2, chip: "R", passed: false, placed: false, chosenColor: "R" },
    4: { playerId: 4, card: 1, chip: "G", passed: false, placed: false, chosenColor: "G" },
    5: { playerId: 5, card: 4, chip: "B", passed: false, placed: false, chosenColor: "B" },
    6: { playerId: 6, card: 0, chip: "R", passed: false, placed: false, chosenColor: "R" },
  };
  var order = H.placementOrder(s);
  var fours = order.filter(function (id) {
    return s.submissions[id].card === 4;
  });
  assert.deepStrictEqual(fours, [5, 0, 1]);
});

t("passers place last in reverse pass order", function () {
  var s = H.createGame({ humanCount: 1, seed: 1 });
  s.players.forEach(function (p, i) {
    H.submit(s, i, i === 6 ? 0 : i, i % 3 === 0 ? "R" : i % 3 === 1 ? "G" : "B");
  });
  H.beginReveal(s);
  H.beginPlace(s);
  var first = H.currentActor(s);
  H.passTurn(s, first);
  var second = H.currentActor(s);
  H.passTurn(s, second);
  while (s.placeQueue.length) {
    var id = H.currentActor(s);
    H.placeNow(s, id, s.submissions[id].chip === "W" ? "R" : s.submissions[id].chip);
  }
  assert.strictEqual(H.currentActor(s), second);
  H.placeNow(s, second, s.submissions[second].chip === "W" ? "R" : s.submissions[second].chip);
  assert.strictEqual(H.currentActor(s), first);
});

t("refill after round 7 keeps pedestals", function () {
  var s = H.createGame({ humanCount: 1, seed: 7 });
  s.pedestals.B.cubes = [{ value: 4, owner: 2 }];
  s.round = 7;
  for (var r = 0; r < 7; r++) {
    /* fill remaining cards so round 7 can submit */
  }
  s.players.forEach(function (p) {
    p.cards = [0];
    p.chips = ["R"];
  });
  s.players.forEach(function (p) {
    H.submit(s, p.id, 0, "R");
  });
  H.beginReveal(s);
  H.beginPlace(s);
  while (s.phase === "place") {
    var id = H.currentActor(s);
    H.placeNow(s, id, "R");
  }
  assert.strictEqual(s.round, 8);
  assert.strictEqual(s.players[0].cards.length, 7);
  assert.strictEqual(s.players[0].chips.length, 7);
  assert.ok(s.pedestals.B.cubes.length >= 1);
});

t("later penalty loses the tie", function () {
  var s = H.createGame({ humanCount: 1, seed: 1 });
  s.players.forEach(function (p) {
    p.penalty = 20;
    p.lastPenaltyRound = 1;
    p.lastPenaltySeq = 1;
  });
  s.players[0].penalty = 4;
  s.players[0].lastPenaltyRound = 10;
  s.players[0].lastPenaltySeq = 10;
  s.players[1].penalty = 4;
  s.players[1].lastPenaltyRound = 12;
  s.players[1].lastPenaltySeq = 12;
  s.players[2].penalty = 2;
  s.players[2].lastPenaltyRound = 8;
  s.players[2].lastPenaltySeq = 8;
  var rank = H.ranking(s);
  assert.strictEqual(rank[0].id, 2);
  assert.strictEqual(rank[1].id, 0);
  assert.strictEqual(rank[2].id, 1);
});

t("full 14-round cpu game finishes", function () {
  var s = H.createGame({ humanCount: 1, seed: 42 });
  s.players.forEach(function (p) {
    p.isHuman = false;
  });
  var guard = 0;
  while (s.phase !== "gameover") {
    playRoundCpu(s);
    if (++guard > 20) fail("game did not end");
  }
  assert.strictEqual(s.round, 14);
  var rank = H.ranking(s);
  assert.strictEqual(rank.length, 7);
  var totalCubes =
    s.pedestals.R.cubes.length + s.pedestals.G.cubes.length + s.pedestals.B.cubes.length;
  assert.ok(totalCubes >= 1);
});

t("two-human names", function () {
  var s = H.createGame({ humanCount: 2, seed: 1 });
  assert.strictEqual(s.players[0].name, "P1");
  assert.strictEqual(s.players[1].name, "P2");
  assert.strictEqual(s.players[0].isHuman, true);
  assert.strictEqual(s.players[1].isHuman, true);
  assert.strictEqual(s.players[2].isHuman, false);
});

t("opening CPU chips are not all red", function () {
  var red = 0;
  var green = 0;
  var blue = 0;
  var rainbow = 0;
  var n = 0;
  for (var seed = 1; seed <= 40; seed++) {
    var s = H.createGame({ humanCount: 1, seed: seed });
    var pending = [];
    s.players.forEach(function (p) {
      if (p.isHuman) return;
      pending.push(AI.chooseSubmit(s, p.id));
    });
    pending.forEach(function (choice) {
      n += 1;
      if (choice.chip === "R") red += 1;
      else if (choice.chip === "G") green += 1;
      else if (choice.chip === "B") blue += 1;
      else rainbow += 1;
    });
  }
  assert.ok(red / n < 0.5, "red share " + red + "/" + n);
  assert.ok(green > 0 && blue > 0, "missing green/blue " + green + " " + blue);
});

t("ui-like 1-human 14 rounds do not stall", function () {
  var s = H.createGame({ humanCount: 1, seed: 99 });
  var guard = 0;
  while (s.phase !== "gameover") {
    var pending = [];
    s.players.forEach(function (p) {
      if (p.isHuman || s.submissions[p.id]) return;
      pending.push({ id: p.id, choice: AI.chooseSubmit(s, p.id) });
    });
    pending.forEach(function (x) {
      H.submit(s, x.id, x.choice.card, x.choice.chip);
    });
    var human = s.players[0];
    if (!s.submissions[human.id]) {
      var hc = AI.chooseSubmit(s, human.id);
      H.submit(s, human.id, hc.card, hc.chip);
    }
    H.beginReveal(s);
    H.beginPlace(s);
    var inner = 0;
    while (s.phase === "place") {
      var id = H.currentActor(s);
      if (id == null) fail("actor null round " + s.round);
      var act = AI.choosePlace(s, id);
      if (act.pass) H.passTurn(s, id);
      else H.placeNow(s, id, act.color);
      if (++inner > 40) fail("place stall round " + s.round);
    }
    if (++guard > 20) fail("game stall");
  }
  assert.strictEqual(s.round, 14);
});

t("same-round later overflow loses the tie", function () {
  var s = H.createGame({ humanCount: 1, seed: 1, dealer: 0 });
  s.pedestals.R.cubes = [
    { value: 6, owner: 2 },
    { value: 6, owner: 3 },
  ];
  s.pedestals.G.cubes = [
    { value: 6, owner: 4 },
    { value: 6, owner: 5 },
  ];
  s.players.forEach(function (p, i) {
    H.submit(s, i, 1, i === 0 ? "R" : i === 1 ? "G" : "B");
  });
  for (var i = 2; i < 7; i++) s.submissions[i].placed = true;
  s.phase = "place";
  s.placeQueue = [0, 1];
  s.passQueue = [];
  s.passActivated = false;
  H.placeNow(s, 0, "R");
  H.placeNow(s, 1, "G");
  assert.strictEqual(s.players[0].penalty, 2);
  assert.strictEqual(s.players[1].penalty, 2);
  assert.ok(s.players[0].lastPenaltySeq < s.players[1].lastPenaltySeq);
  var tied = H.ranking(s).filter(function (r) {
    return r.penalty === 2;
  });
  assert.deepStrictEqual(
    tied.map(function (r) {
      return r.id;
    }),
    [0, 1]
  );
});

t("cpu submit ignores this-round chips", function () {
  var a = H.createGame({ humanCount: 1, seed: 11, dealer: 0 });
  var b = H.createGame({ humanCount: 1, seed: 11, dealer: 0 });
  for (var i = 2; i < 7; i++) {
    H.submit(b, i, 0, "R");
  }
  var ca = AI.chooseSubmit(a, 1);
  var cb = AI.chooseSubmit(b, 1);
  assert.deepStrictEqual(ca, cb);
});

console.log("\n" + tests + " tests passed");
