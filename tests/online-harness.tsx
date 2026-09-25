import React from 'react';
import ReactDOM from 'react-dom/client';
import { createGame } from '../src/engine';
import { CARDS } from '../src/data/cards';
import { GameTable } from '../src/ui/GameTable';
import '../src/styles.css';

const game = createGame({
  players: [{ id: 'P0', name: '线上玩家', isAI: false }, { id: 'P1', name: '对手', isAI: false }],
  cards: CARDS,
  seed: 42,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div className="app">
    <header className="topbar"><h1>璀璨宝石：宝可梦 <span className="subtitle">联机 · 线上玩家</span></h1></header>
    <GameTable game={game} youIndex={0} dispatch={() => {}} />
  </div>,
);
