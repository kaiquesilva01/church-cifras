import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatBytes, type Stats, type StatsApi, type TopSong } from './statsApi';

type Range = 'allTime' | 'last30Days';

const RANGES: { value: Range; label: string }[] = [
  { value: 'allTime', label: 'Todo o período' },
  { value: 'last30Days', label: 'Últimos 30 dias' },
];

const RANKING_KEY: Record<Range, keyof Pick<Stats, 'topAllTime' | 'topLast30Days'>> = {
  allTime: 'topAllTime',
  last30Days: 'topLast30Days',
};

function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

function StorageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

function RankingRow({ song, position }: { song: TopSong; position: number }) {
  return (
    <li>
      <Link to={`/musicas/${song.songId}`} className="stats-row">
        <span className="stats-rank">{position}</span>
        <span className="stats-row-text">
          <span className="stats-row-title">{song.title}</span>
          <span className="stats-row-artist">{song.artistName}</span>
        </span>
        <span className="stats-count">
          <span className="stats-count-number">{formatCount(song.uses)}</span>
          <span className="stats-count-label">{song.uses === 1 ? ' uso' : ' usos'}</span>
        </span>
      </Link>
    </li>
  );
}

export function StatsPage({ api }: { api: StatsApi }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [range, setRange] = useState<Range>('allTime');

  useEffect(() => {
    let active = true;
    api
      .getStats()
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  let body;
  if (loadError) {
    body = (
      <p role="alert" className="error">
        Não foi possível carregar as estatísticas.
      </p>
    );
  } else if (!stats) {
    body = (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  } else {
    const ranking = stats[RANKING_KEY[range]];
    body = (
      <>
        <div className="stats-acervo">
          <div className="stats-card stats-card-pdfs">
            <p className="eyebrow">PDFs</p>
            <p className="stats-figure">{formatCount(stats.pdfCount)}</p>
            <p className="stats-sub">
              {`${formatCount(stats.handmadeCount)} à mão · ${formatCount(stats.generatedCount)} gerados`}
            </p>
          </div>
          <div className="stats-card stats-card-songs">
            <p className="eyebrow">Músicas</p>
            <p className="stats-figure">{formatCount(stats.songCount)}</p>
            <p className="stats-sub">no acervo</p>
          </div>
        </div>

        <div className="stats-card stats-storage">
          <span className="stats-storage-icon">
            <StorageIcon />
          </span>
          <div className="stats-storage-text">
            <p className="eyebrow">Armazenamento</p>
            <p className="stats-storage-value">{formatBytes(stats.storageBytes)}</p>
            <p className="stats-sub">
              {stats.pdfCount > 0
                ? `só PDFs · média de ${formatBytes(stats.storageBytes / stats.pdfCount)} por arquivo`
                : 'só PDFs'}
            </p>
          </div>
        </div>

        <section className="stats-ranking-block">
          <h2 className="stats-ranking-title">Cifras mais usadas</h2>
          <div className="stats-segmented">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                className="stats-segment"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {ranking.length === 0 ? (
            <p className="stats-empty">Ainda não há repertórios fechados.</p>
          ) : (
            <ol className="menu-card stats-ranking">
              {ranking.map((song, index) => (
                <RankingRow key={song.songId} song={song} position={index + 1} />
              ))}
            </ol>
          )}
          <p className="stats-note">
            Uma música conta quando entra em um repertório que já fechou, isto é, depois do dia
            seguinte ao culto. Contada uma vez por repertório.
          </p>
        </section>
      </>
    );
  }

  return (
    <section className="stats-page">
      <Link to="/mais" className="back">
        ‹ Voltar
      </Link>
      <div className="stats-title">
        <p className="eyebrow">ADMIN</p>
        <h1 className="screen-title">Estatísticas</h1>
      </div>
      {body}
    </section>
  );
}
