import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { applyAction, createGame, type GameState } from '../src/engine';
import { CARDS } from '../src/data/cards';
import { GameTable } from '../src/ui/GameTable';
import '../src/styles.css';

const viewer = new URLSearchParams(location.search).has('viewer');

function Harness() {
  const [game, setGame] = useState<GameState>(() => createGame({
    players: [{ id: 'P0', name: '线上玩家', isAI: false }, { id: 'P1', name: '对手', isAI: false }],
    cards: CARDS,
    seed: 42,
  }));
  return <div className="app solo-game">
    <header className="topbar"><h1>璀璨宝石：宝可梦 <span className="subtitle">联机 · {viewer ? '观战' : '线上玩家'}</span></h1></header>
    <GameTable game={game} youIndex={viewer ? null : 0} mode="online" dispatch={(action) => setGame((current) => applyAction(current, action))} />
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Harness />,
);
