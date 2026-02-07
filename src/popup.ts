import { getAllScoresForLevel } from "./supabase/api";

function createScoreGraph(
  allScores: number[],
  userScore: number,
  container: HTMLElement
): void {
  container.innerHTML = "";

  if (allScores.length === 0) {
    container.textContent = "No data available";
    return;
  }

  // sort scores and count occurrences
  const sortedScores = [...allScores].sort((a, b) => a - b);
  const minScore = sortedScores[0];
  const maxScore = sortedScores[sortedScores.length - 1];
  const range = maxScore - minScore;

  // count occurrences of each score
  const scoreCounts = new Map<number, number>();
  sortedScores.forEach((score) => {
    scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1);
  });

  const uniqueScores = Array.from(scoreCounts.keys());
  const maxCount = Math.max(...Array.from(scoreCounts.values()));

  // create canvas for graph
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 200;
  canvas.className = "success-graph-canvas";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const graphHeight = canvas.height - 50;
  const horizontalPadding = 20;
  const graphWidth = canvas.width - (horizontalPadding * 2);
  
  // calculate positions based on score values (proportional spacing)
  const scorePositions = new Map<number, number>();
  
  // handle edge case where all scores are the same or range is invalid
  if (range === 0 || !isFinite(range)) {
    const centerX = horizontalPadding + graphWidth / 2;
    uniqueScores.forEach((score) => {
      scorePositions.set(score, centerX);
    });
  } else {
    uniqueScores.forEach((score) => {
      // map score to position based on its value relative to min/max
      const position = horizontalPadding + ((score - minScore) / range) * graphWidth;
      scorePositions.set(score, position);
    });
  }
  
  // calculate bar width - 3px default, scale down if many points or close together
  const positions = Array.from(scorePositions.values()).sort((a, b) => a - b);
  let minSpacing = graphWidth;
  
  for (let i = 1; i < positions.length; i++) {
    minSpacing = Math.min(minSpacing, positions[i] - positions[i - 1]);
  }
  
  // scale based on spacing and number of points
  const spacingWidth = Math.min(3, minSpacing * 0.8);
  const densityWidth = uniqueScores.length > 50 ? 3 * (50 / uniqueScores.length) : 3;
  const barWidth = Math.max(1, Math.round(Math.min(spacingWidth, densityWidth)));

  // hover functionality
  let hoveredScore: number | null = null;

  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // redraw bars with proportional spacing
    uniqueScores.forEach((score) => {
      const count = scoreCounts.get(score)!;
      const barHeight = (count / maxCount) * graphHeight;
      const x = scorePositions.get(score)! - barWidth / 2; // center bar on position
      const y = canvas.height - barHeight - 30; // leave space for labels

      const isUserScore = score === userScore;

      // draw bar (square/rectangular) - no border, lighter purple
      ctx.fillStyle = isUserScore ? "#76428a" : "#e8ddf3";
      ctx.fillRect(x, y, barWidth, barHeight);
    });

    // redraw user score indicator if needed
    const userScoreIndex = uniqueScores.indexOf(userScore);
    if (userScoreIndex === -1) {
      const userX = horizontalPadding + ((userScore - minScore) / range) * graphWidth;
      ctx.strokeStyle = "#76428a";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(userX, 0);
      ctx.lineTo(userX, canvas.height - 30);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#76428a";
      ctx.beginPath();
      ctx.moveTo(userX, canvas.height - 30);
      ctx.lineTo(userX - 6, canvas.height - 20);
      ctx.lineTo(userX + 6, canvas.height - 20);
      ctx.closePath();
      ctx.fill();
    }

    // draw hovered score label underneath the bar
    if (hoveredScore !== null) {
      ctx.fillStyle = "#76428a";
      ctx.font = "12px PixelArial";
      ctx.textAlign = "center";
      const x = scorePositions.get(hoveredScore)!;
      ctx.fillText(hoveredScore.toString(), x, canvas.height - 5);
    }
  };

  // handle mouse move
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // check if mouse is over any bar
    let found = false;
    uniqueScores.forEach((score) => {
      const x = scorePositions.get(score)! - barWidth / 2;
      const barTop = canvas.height - 30 - graphHeight;
      const barBottom = canvas.height - 30;
      
      if (mouseX >= x && mouseX <= x + barWidth && mouseY >= barTop && mouseY <= barBottom) {
        hoveredScore = score;
        found = true;
      }
    });

    if (!found) {
      hoveredScore = null;
    }

    redraw();
  });

  canvas.addEventListener("mouseleave", () => {
    hoveredScore = null;
    redraw();
  });

  // initial draw
  redraw();
}

// determine message based on score vs BFS optimal and other players
function getScoreMessage(userScore: number, allScores: number[], optimalMoves?: number): string | null {
  // if we know the true optimal (from BFS), check against that first
  if (optimalMoves !== undefined && userScore === optimalMoves) {
    return "optimal path!";
  }

  if (allScores.length === 0) return null;
  
  const sortedScores = [...allScores].sort((a, b) => a - b);
  const maxScore = sortedScores[sortedScores.length - 1];
  
  // if we know the optimal, compare against it
  if (optimalMoves !== undefined) {
    if (userScore === optimalMoves + 1) {
      return "almost perfect!";
    }
    if (userScore <= optimalMoves + 2) {
      return "great job!";
    }
  } else {
    // fallback: compare against other players (but never say "optimal path!" without BFS proof)
    const minScore = sortedScores[0];
    if (userScore === minScore + 1) {
      return "almost perfect!";
    }
    if (userScore <= minScore + 2) {
      return "great job!";
    }
  }
  
  // worst score among players
  if (userScore === maxScore && allScores.length > 1) {
    return "oh...";
  }
  
  return null;
}

export function showSuccessPopup(
  dayNumber: number,
  score: number,
  levelId: string,
  optimalMoves?: number,
  onViewOptimal?: () => void,
  hideGraph?: boolean
): void {
  const popup = document.getElementById("success-popup");
  if (!popup) return;

  // set day number
  const dayTextEl = popup.querySelector(".success-day-text");
  if (dayTextEl) {
    dayTextEl.textContent = `Results - Day ${dayNumber}`;
  }

  // set score
  const scoreEl = popup.querySelector(".success-score-value");
  if (scoreEl) {
    scoreEl.textContent = score.toString();
  }

  // show optimal score reference
  const optimalScoreEl = popup.querySelector(".success-optimal-score");
  if (optimalScoreEl && optimalScoreEl instanceof HTMLElement) {
    if (optimalMoves !== undefined && score !== optimalMoves) {
      optimalScoreEl.textContent = `optimal: ${optimalMoves}`;
      optimalScoreEl.style.display = "block";
    } else {
      optimalScoreEl.style.display = "none";
    }
  }

  // hide message initially
  const messageEl = popup.querySelector(".success-optimal-message");
  if (messageEl && messageEl instanceof HTMLElement) {
    messageEl.style.display = "none";
    messageEl.textContent = "";
  }

  // show/hide "view optimal path" button
  const viewOptimalBtn = document.getElementById("success-popup-view-optimal-btn");
  if (viewOptimalBtn) {
    if (optimalMoves !== undefined && score !== optimalMoves && onViewOptimal) {
      viewOptimalBtn.style.display = "inline-block";
      // replace button to clear old listeners
      const freshBtn = viewOptimalBtn.cloneNode(true) as HTMLElement;
      viewOptimalBtn.parentNode?.replaceChild(freshBtn, viewOptimalBtn);
      freshBtn.addEventListener("click", () => {
        hideSuccessPopup();
        onViewOptimal();
      });
    } else {
      viewOptimalBtn.style.display = "none";
    }
  }

  // hide or show the distribution section
  const distributionSection = popup.querySelector(".success-distribution-section");
  if (distributionSection && distributionSection instanceof HTMLElement) {
    distributionSection.style.display = hideGraph ? "none" : "block";
  }

  // show popup immediately, even before data loads
  popup.style.display = "flex";

  if (hideGraph) {
    // no graph to show — just determine message from BFS optimal alone
    const message = getScoreMessage(score, [], optimalMoves);
    if (messageEl && messageEl instanceof HTMLElement) {
      if (message) {
        messageEl.textContent = message;
        messageEl.style.display = "block";
      } else {
        messageEl.style.display = "none";
      }
    }
    return;
  }

  // calculate and display percentile with graph
  const percentileEl = popup.querySelector(".success-percentile");
  const graphContainer = popup.querySelector(".success-graph-container");
  
  if (percentileEl) {
    percentileEl.textContent = "calculating...";
  }
  
  if (graphContainer) {
    graphContainer.innerHTML = "<div style='color: #76428a; font-family: PixelArial;'>loading graph...</div>";
  }

  getAllScoresForLevel(levelId)
    .then((allScores) => {
      try {
        // determine and show message based on score vs BFS optimal and other players
        const message = getScoreMessage(score, allScores, optimalMoves);
        if (messageEl && messageEl instanceof HTMLElement) {
          if (message) {
            messageEl.textContent = message;
            messageEl.style.display = "block";
          } else {
            messageEl.style.display = "none";
          }
        }
        
        if (graphContainer && graphContainer instanceof HTMLElement) {
          createScoreGraph(allScores, score, graphContainer);
        }
      } catch (error) {
        console.error("Error processing scores:", error);
        if (graphContainer) {
          graphContainer.innerHTML = "<div style='color: #76428a; font-family: PixelArial;'>Error processing data</div>";
        }
      }
    })
    .catch((error) => {
      console.error("Error loading scores:", error);
      if (percentileEl) {
        percentileEl.textContent = "N/A";
      }
      if (graphContainer) {
        graphContainer.innerHTML = "<div style='color: #76428a; font-family: PixelArial;'>Error loading graph</div>";
      }
    });
}

export function hideSuccessPopup(): void {
  const popup = document.getElementById("success-popup");
  if (popup) {
    popup.style.display = "none";
  }
}

