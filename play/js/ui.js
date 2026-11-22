(function () {
  "use strict";
  var H = window.Heavy13;
  var AI = window.Heavy13AI;
  var app = document.getElementById("app");
  var game = null;
  var screen = "menu";
  var selectedCard = null;
  var selectedChip = null;
  var handoffFor = null;
  var cpuTimer = null;
  var rainbowPick = false;

  var KO = H.COLOR_KO;
  function pedName(c) {
    return c === "R" ? "빨강" : c === "G" ? "초록" : "파랑";
  }

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function clearTimer() {
    if (cpuTimer) {
      clearTimeout(cpuTimer);
      cpuTimer = null;
    }
  }

  function goMenu() {
    clearTimer();
    game = null;
    screen = "menu";
    selectedCard = null;
    selectedChip = null;
    handoffFor = null;
    rainbowPick = false;
    render();
  }

  function start(humanCount) {
    game = H.createGame({ humanCount: humanCount, seed: Date.now() % 100000 });
    screen = "game";
    selectedCard = null;
    selectedChip = null;
    rainbowPick = false;
    submitCpus();
    var next = H.remainingHumans(game)[0];
    if (humanCount === 2 && next) {
      handoffFor = next.id;
      screen = "handoff";
    }
    render();
  }

  function submitCpus() {
    game.players.forEach(function (p) {
      if (p.isHuman || game.submissions[p.id]) return;
      var c = AI.chooseSubmit(game, p.id);
      H.submit(game, p.id, c.card, c.chip);
    });
  }

  function afterHumanSubmit() {
    selectedCard = null;
    selectedChip = null;
    var left = H.remainingHumans(game);
    if (left.length) {
      handoffFor = left[0].id;
      screen = "handoff";
      render();
      return;
    }
    screen = "game";
    H.beginReveal(game);
    H.beginPlace(game);
    render();
    queueCpuPlace();
  }

  function queueCpuPlace() {
    clearTimer();
    if (!game || game.phase !== "place") return;
    var id = H.currentActor(game);
    if (id == null) return;
    if (game.players[id].isHuman) return;
    cpuTimer = setTimeout(function () {
      var act = AI.choosePlace(game, id);
      if (act.pass) H.passTurn(game, id);
      else H.placeNow(game, id, act.color);
      render();
      queueCpuPlace();
    }, 520);
  }

  function chipsHtml(list, sel) {
    var seen = {};
    return list
      .map(function (c, i) {
        var key = c + "-" + i;
        var label = c === "W" ? "무지개" : pedName(c);
        var on = sel === i ? " sel" : "";
        return (
          '<button class="chip ' +
          c +
          on +
          '" data-chip-i="' +
          i +
          '" data-chip="' +
          c +
          '">' +
          label +
          "</button>"
        );
      })
      .join("");
  }

  function cardsHtml(list, sel) {
    return list
      .map(function (c, i) {
        return (
          '<button class="card' +
          (sel === i ? " sel" : "") +
          '" data-card-i="' +
          i +
          '" data-card="' +
          c +
          '">' +
          c +
          "</button>"
        );
      })
      .join("");
  }

  function pedestalsHtml() {
    return H.COLORS.map(function (c) {
      var p = game.pedestals[c];
      var sum = H.pedestalSum(p);
      var cubes = p.cubes
        .map(function (x) {
          return '<span class="cube">' + x.value + "</span>";
        })
        .join("");
      return (
        '<div class="ped ' +
        c +
        '"><div class="lab">' +
        pedName(c) +
        '</div><div class="sum">' +
        sum +
        " <span>/ 13</span></div><div class=\"cubes\">" +
        cubes +
        "</div></div>"
      );
    }).join("");
  }

  function boardHtml(hideHands) {
    var actor = H.currentActor(game);
    return game.players
      .map(function (p) {
        var me = hideHands === p.id;
        var cls = me ? "row me" : "row";
        var mark = p.id === game.dealer ? "선" : "";
        var sub = game.submissions[p.id];
        var extra = "";
        if (game.phase === "submit") extra = sub ? "제출" : "대기";
        else if (sub && game.phase !== "submit") {
          extra = (sub.chip === "W" ? "무지개" : pedName(sub.chip)) + " " + sub.card;
          if (sub.passed && !sub.placed) extra += " 패스";
          if (sub.placed) extra += " 배치";
        }
        return (
          '<div class="' +
          cls +
          '"><span class="dot' +
          (p.id === actor ? " on" : "") +
          '"></span><span class="nm">' +
          p.name +
          (mark ? " · " + mark : "") +
          '</span><span class="pen">-' +
          p.penalty +
          "</span><span>" +
          extra +
          "</span></div>"
        );
      })
      .join("");
  }

  function logHtml() {
    return (game.log.slice(-4) || [])
      .map(function (x) {
        return "<div>" + x.text + "</div>";
      })
      .join("");
  }

  function humanHand(id) {
    var p = game.players[id];
    return (
      '<div class="panel"><div class="status">' +
      p.name +
      " 제출</div><div style=\"margin:10px 0 6px;color:var(--muted);font-size:13px\">바위 카드</div><div class=\"hand\">" +
      cardsHtml(p.cards, selectedCard) +
      '</div><div style="margin:12px 0 6px;color:var(--muted);font-size:13px">색깔 칩</div><div class="hand">' +
      chipsHtml(p.chips, selectedChip) +
      '</div><div class="actions one" style="margin-top:12px"><button class="btn" id="do-submit">이 패 제출</button></div></div>'
    );
  }

  function placeControls(id) {
    var sub = game.submissions[id];
    var canPass = game.placeQueue[0] === id && !sub.passed;
    if (sub.chip === "W" && rainbowPick === false && !sub.chosenColor) {
      return (
        '<div class="panel"><div class="status">레인보우 · 받침대 선택</div><div class="actions" style="margin-top:12px">' +
        '<button class="btn" data-pick="R">빨강</button>' +
        '<button class="btn" data-pick="G">초록</button>' +
        '<button class="btn" data-pick="B">파랑</button></div>' +
        (canPass
          ? '<div class="actions one" style="margin-top:8px"><button class="btn secondary" id="do-pass">패스</button></div>'
          : "") +
        "</div>"
      );
    }
    var color = sub.chip === "W" ? rainbowPick || sub.chosenColor : sub.chip;
    return (
      '<div class="panel"><div class="status">' +
      game.players[id].name +
      " 배치 · " +
      (color ? pedName(color) + " " : "") +
      sub.card +
      '</div><div class="actions" style="margin-top:12px">' +
      (canPass ? '<button class="btn secondary" id="do-pass">패스</button>' : "") +
      '<button class="btn" id="do-place">올리기</button></div></div>'
    );
  }

  function renderMenu() {
    app.innerHTML =
      '<div class="hero"><div class="mark">13</div><h1>무거운 13</h1><p>짐꾼 받침대 합이 13이 되지 않게<br>바위를 올리는 벌점 게임</p></div>' +
      '<div class="col"><button class="btn" data-start="1">1인 · 컴퓨터 6명</button>' +
      '<button class="btn secondary" data-start="2">2인 · 한 기기에서 번갈아</button>' +
      '<button class="btn ghost" id="show-rules">규칙 보기</button></div>';
  }

  function renderRules() {
    app.innerHTML =
      '<div class="panel rules"><h2 style="color:var(--ink);margin-bottom:10px">규칙</h2>' +
      "<p>7명, 14라운드. 각자 바위 카드 0~6과 빨강·초록·파랑 칩 2개, 레인보우 1개.</p>" +
      "<p>매 라운드 카드 1장과 칩 1장을 숨겨 제출합니다. 칩은 받침대 색, 카드는 무게입니다.</p>" +
      "<p>레인보우가 먼저, 그다음 숫자가 큰 순. 동점이면 선 플레이어부터 시계 방향.</p>" +
      "<p>배치 때 한 번 패스할 수 있습니다. 패스한 사람은 맨 뒤에, 여러 명이면 패스한 역순.</p>" +
      "<p>받침대 합이 13 이상이 되면, 올리기 <b>전</b>에 있던 바위 개수만큼 벌점. 방금 올린 바위는 남습니다.</p>" +
      "<p>0은 합을 올리지 않고 개수만 늘립니다. 7라운드 뒤 패는 다시 받고 받침대는 유지됩니다.</p>" +
      "<p>벌점이 적을수록 상위. 동점이면 더 최근에 벌점을 받은 쪽이 아래입니다.</p>" +
      '</div><button class="btn" id="back-menu">돌아가기</button>';
  }

  function renderHandoff() {
    var p = game.players[handoffFor];
    app.innerHTML =
      '<div class="hero"><h1>' +
      p.name +
      " 차례</h1><p>화면을 넘겨 받은 뒤 시작하세요.<br>다른 사람의 패는 보이지 않습니다.</p></div>" +
      '<button class="btn" id="handoff-ok">패 보기</button>';
  }

  function renderEnd() {
    var rank = H.ranking(game);
    var rows = rank
      .map(function (r, i) {
        return (
          '<div class="r' +
          (i === 0 ? " win" : "") +
          '"><span>' +
          (i + 1) +
          "위 " +
          r.name +
          "</span><span>-" +
          r.penalty +
          "</span></div>"
        );
      })
      .join("");
    app.innerHTML =
      '<div class="hero"><h1>종료</h1><p>벌점이 가장 적은 사람이 1위입니다.</p></div>' +
      '<div class="rank">' +
      rows +
      '</div><div class="col" style="margin-top:12px"><button class="btn" id="again">다시하기</button>' +
      '<button class="btn ghost" id="back-menu">처음으로</button></div>';
  }

  function renderGame() {
    var actor = H.currentActor(game);
    var submitHuman = null;
    if (game.phase === "submit") {
      var left = H.remainingHumans(game);
      submitHuman = left.length ? left[0].id : null;
    }
    var status = "";
    if (game.phase === "submit") status = (submitHuman != null ? game.players[submitHuman].name : "") + " 제출";
    else if (game.phase === "place") status = game.players[actor].name + " 배치";
    var controls = "";
    if (game.phase === "submit" && submitHuman != null) controls = humanHand(submitHuman);
    else if (game.phase === "place" && actor != null && game.players[actor].isHuman) controls = placeControls(actor);

    app.innerHTML =
      '<div class="topbar"><h2>' +
      game.round +
      " / 14 라운드</h2><div class=\"pill\">선 " +
      game.players[game.dealer].name +
      '</div></div><div class="peds">' +
      pedestalsHtml() +
      '</div><div class="panel"><div class="status">' +
      status +
      '</div><div class="board" style="margin-top:8px">' +
      boardHtml(submitHuman) +
      '</div></div><div class="panel log">' +
      logHtml() +
      "</div>" +
      controls +
      '<button class="btn ghost" id="back-menu">그만두기</button>';
  }

  function render() {
    if (screen === "menu") renderMenu();
    else if (screen === "rules") renderRules();
    else if (screen === "handoff") renderHandoff();
    else if (game && game.phase === "gameover") renderEnd();
    else renderGame();
  }

  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-start], [data-card-i], [data-chip-i], [data-pick], button");
    if (!t) return;
    if (t.dataset.start) {
      start(Number(t.dataset.start));
      return;
    }
    if (t.id === "show-rules") {
      screen = "rules";
      render();
      return;
    }
    if (t.id === "back-menu") {
      goMenu();
      return;
    }
    if (t.id === "again") {
      start(game ? game.humanCount : 1);
      return;
    }
    if (t.id === "handoff-ok") {
      screen = "game";
      selectedCard = null;
      selectedChip = null;
      render();
      return;
    }
    if (t.dataset.cardI != null) {
      selectedCard = Number(t.dataset.cardI);
      render();
      return;
    }
    if (t.dataset.chipI != null) {
      selectedChip = Number(t.dataset.chipI);
      render();
      return;
    }
    if (t.dataset.pick) {
      rainbowPick = t.dataset.pick;
      var idp = H.currentActor(game);
      if (idp != null) game.submissions[idp].chosenColor = rainbowPick;
      render();
      return;
    }
    if (t.id === "do-submit") {
      var hum = H.remainingHumans(game)[0];
      if (!hum) return;
      if (selectedCard == null || selectedChip == null) return;
      var card = hum.cards[selectedCard];
      var chip = hum.chips[selectedChip];
      try {
        H.submit(game, hum.id, card, chip);
      } catch (err) {
        return;
      }
      afterHumanSubmit();
      return;
    }
    if (t.id === "do-pass") {
      var id = H.currentActor(game);
      try {
        H.passTurn(game, id);
      } catch (err) {
        return;
      }
      rainbowPick = false;
      render();
      queueCpuPlace();
      return;
    }
    if (t.id === "do-place") {
      var pid = H.currentActor(game);
      var sub = game.submissions[pid];
      var color = sub.chip === "W" ? rainbowPick || sub.chosenColor : sub.chip;
      if (sub.chip === "W" && !color) return;
      try {
        H.placeNow(game, pid, color);
      } catch (err) {
        return;
      }
      rainbowPick = false;
      render();
      queueCpuPlace();
    }
  });

  render();
})();
