import React, { useState, useEffect, useRef, useMemo } from 'react';
import Plotly from 'plotly.js-dist';
import './EmotionWheel.css';

// Define the 8 core emotions based on Plutchik's wheel
const CORE_EMOTIONS = [
  "Joy", "Trust", "Fear", "Surprise",
  "Sadness", "Disgust", "Anger", "Anticipation"
];

// Define colors for each emotion (using Plutchik's traditional color scheme)
const EMOTION_COLORS = {
  "Joy": "#FFFF00",  // Yellow
  "Trust": "#00FF00",  // Green
  "Fear": "#00FFFF",  // Light Blue
  "Surprise": "#0000FF",  // Blue
  "Sadness": "#FF00FF",  // Purple
  "Disgust": "#800080",  // Violet
  "Anger": "#FF0000",  // Red
  "Anticipation": "#FFA500",  // Orange
};

// Helper function to convert hex to rgba - memoized for performance
const hexToRgbaCache = {};
const hexToRgba = (hex, alpha = 1) => {
  // Use cached value if available
  const cacheKey = `${hex}-${alpha}`;
  if (hexToRgbaCache[cacheKey]) {
    return hexToRgbaCache[cacheKey];
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const result = `rgba(${r}, ${g}, ${b}, ${alpha})`;

  // Cache the result
  hexToRgbaCache[cacheKey] = result;
  return result;
};

// Cache for polygon generation to improve performance
const polygonCache = {};

// Helper function to generate a smooth polygon for the emotion wheel - optimized with caching
const generateSmoothPolygon = (emotionScores) => {
  // Create a simplified cache key based on rounded emotion scores for better cache hits
  const cacheKey = Object.entries(emotionScores)
    .map(([emotion, score]) => `${emotion}:${Math.round(score * 10) / 10}`)
    .join('|');

  // Return cached result if available
  if (polygonCache[cacheKey]) {
    return polygonCache[cacheKey];
  }

  // Number of points - optimized for performance
  const numPoints = 16; // Reduced for better performance

  // Generate points for the polygon
  const r = [];
  const theta = [];

  for (let i = 0; i < numPoints; i++) {
    // Calculate the angle for this point
    const angle = (i * 360 / numPoints) * (Math.PI / 180);

    // Find the two closest emotions
    const emotionIndex1 = Math.floor(i * 8 / numPoints);
    const emotionIndex2 = (emotionIndex1 + 1) % 8;

    // Get the emotions
    const emotion1 = CORE_EMOTIONS[emotionIndex1];
    const emotion2 = CORE_EMOTIONS[emotionIndex2];

    // Get the scores
    const score1 = emotionScores[emotion1] || 0;
    const score2 = emotionScores[emotion2] || 0;

    // Calculate the interpolation factor
    const factor = (i * 8 / numPoints) - emotionIndex1;

    // Use simple linear interpolation for better performance
    const interpolatedScore = score1 + factor * (score2 - score1);

    // Add a small minimum value to ensure the polygon is visible even with zero scores
    const finalScore = Math.max(interpolatedScore, 0.1);

    // Add the point
    r.push(finalScore);
    theta.push(angle * 180 / Math.PI);
  }

  // Close the polygon by repeating the first point
  if (r.length > 0 && theta.length > 0) {
    r.push(r[0]);
    theta.push(theta[0]);
  }

  // Cache the result
  const result = { r, theta };
  polygonCache[cacheKey] = result;

  // Limit cache size to prevent memory leaks
  const cacheKeys = Object.keys(polygonCache);
  if (cacheKeys.length > 50) {
    delete polygonCache[cacheKeys[0]];
  }

  return result;
};

const EmotionWheel = ({ emotions, height = 400, width = 400 }) => {
  const plotRef = useRef(null);
  const lastEmotionsRef = useRef(null);
  const lastUpdateTimeRef = useRef(Date.now());
  const plotlyInitializedRef = useRef(false);

  // Memoize the current emotions with smooth transitions
  const { currentUserEmotions, currentAssistantEmotions } = useMemo(() => {
    // Skip processing if emotions data is not valid
    if (!emotions || !emotions.user || !emotions.assistant) {
      return {
        currentUserEmotions: CORE_EMOTIONS.reduce((acc, emotion) => {
          acc[emotion] = 0;
          return acc;
        }, {}),
        currentAssistantEmotions: CORE_EMOTIONS.reduce((acc, emotion) => {
          acc[emotion] = 0;
          return acc;
        }, {})
      };
    }

    // Initialize last emotions if not already set
    if (!lastEmotionsRef.current) {
      lastEmotionsRef.current = {
        user: {...emotions.user},
        assistant: {...emotions.assistant}
      };
      lastUpdateTimeRef.current = Date.now();

      return {
        currentUserEmotions: emotions.user,
        currentAssistantEmotions: emotions.assistant
      };
    }

    // Check if we need to interpolate at all - if values are very close, just use new values
    let needsInterpolation = false;

    // Quick check on a few key emotions to see if interpolation is needed
    for (const emotion of ['Joy', 'Trust', 'Fear']) {
      if (Math.abs((lastEmotionsRef.current.user[emotion] || 0) - (emotions.user[emotion] || 0)) > 0.2 ||
          Math.abs((lastEmotionsRef.current.assistant[emotion] || 0) - (emotions.assistant[emotion] || 0)) > 0.2) {
        needsInterpolation = true;
        break;
      }
    }

    // If values are close enough, just use the new values directly
    if (!needsInterpolation) {
      return {
        currentUserEmotions: emotions.user,
        currentAssistantEmotions: emotions.assistant
      };
    }

    // For larger changes, use a shorter transition for better responsiveness
    const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;
    const transitionDuration = 200; // ms - reduced from 300ms

    // Calculate interpolation factor (0 to 1)
    const interpolationFactor = Math.min(1, timeSinceLastUpdate / transitionDuration);

    // Create interpolated emotion objects - pre-allocate for better performance
    const interpolatedUserEmotions = {...lastEmotionsRef.current.user};
    const interpolatedAssistantEmotions = {...lastEmotionsRef.current.assistant};

    // Only interpolate emotions that have changed significantly
    for (const emotion of CORE_EMOTIONS) {
      const oldUserValue = lastEmotionsRef.current.user[emotion] || 0;
      const newUserValue = emotions.user[emotion] || 0;
      if (Math.abs(newUserValue - oldUserValue) > 0.05) {
        interpolatedUserEmotions[emotion] = oldUserValue + (newUserValue - oldUserValue) * interpolationFactor;
      }

      const oldAssistantValue = lastEmotionsRef.current.assistant[emotion] || 0;
      const newAssistantValue = emotions.assistant[emotion] || 0;
      if (Math.abs(newAssistantValue - oldAssistantValue) > 0.05) {
        interpolatedAssistantEmotions[emotion] = oldAssistantValue + (newAssistantValue - oldAssistantValue) * interpolationFactor;
      }
    }

    // If transition is complete, update the reference values
    if (interpolationFactor >= 1) {
      lastEmotionsRef.current = {
        user: {...emotions.user},
        assistant: {...emotions.assistant}
      };
      lastUpdateTimeRef.current = Date.now();

      return {
        currentUserEmotions: emotions.user,
        currentAssistantEmotions: emotions.assistant
      };
    }

    // Return interpolated values for smooth transition
    return {
      currentUserEmotions: interpolatedUserEmotions,
      currentAssistantEmotions: interpolatedAssistantEmotions
    };
  }, [emotions]);

  // Memoize the sector traces to avoid recreating them on every render
  const sectorTraces = useMemo(() => {
    const traces = [];

    // Add emotion sectors
    for (let i = 0; i < CORE_EMOTIONS.length; i++) {
      const emotion = CORE_EMOTIONS[i];
      const angle = i * 45;  // 360 / 8 = 45 degrees per emotion

      // Add sector labels with improved positioning
      let labelR = 3.6;  // Default distance
      let labelTheta = angle;
      let labelFont = {
        color: EMOTION_COLORS[emotion],
        size: 12,
        family: 'Arial, sans-serif'
      };

      // Adjust specific labels that might overlap
      if (['Sadness', 'Disgust', 'Fear', 'Surprise'].includes(emotion)) {
        labelR = 3.7;
      }

      traces.push({
        type: 'scatterpolar',
        r: [labelR],
        theta: [labelTheta],
        text: [emotion],
        mode: 'text',
        textfont: labelFont,
        showlegend: false
      });

      // Add colored sectors with improved styling - reduced points for better performance
      const sectorTheta = [];
      const sectorR = [];

      // Create sector shape with minimal points for better performance
      for (let j = 0; j < 8; j++) {  // Reduced from 15 to 8 points
        sectorTheta.push(angle - 22.5 + j * 45 / 7);
        sectorR.push(2.8);
      }

      traces.push({
        type: 'scatterpolar',
        r: sectorR,
        theta: sectorTheta,
        fill: 'toself',
        fillcolor: hexToRgba(EMOTION_COLORS[emotion], 0.07),
        line: {
          color: hexToRgba(EMOTION_COLORS[emotion], 0.3),
          width: 0.5,
          dash: 'dot'
        },
        showlegend: false,
        hoverinfo: 'none'
      });
    }

    return traces;
  }, []); // Empty dependency array means this only runs once

  // Memoize the layout configuration
  const plotLayout = useMemo(() => {
    return {
      polar: {
        radialaxis: {
          visible: true,
          range: [0, 4.0],
          showticklabels: false,
          ticks: '',
          showline: false,
          showgrid: false
        },
        angularaxis: {
          visible: true,
          tickmode: 'array',
          tickvals: Array.from({ length: 8 }, (_, i) => i * 45),
          ticktext: Array(8).fill(''),
          direction: 'clockwise',
          rotation: 22.5,
          showticklabels: false,
          showline: false,
          showgrid: false
        },
        bgcolor: 'rgba(248, 248, 252, 0.5)'
      },
      showlegend: true,
      title: {
        text: "",
        font: {
          family: 'Arial, sans-serif',
          size: 0,
          color: '#333'
        },
        y: 0.98
      },
      height: height,
      width: width,
      margin: {
        l: 30,
        r: 30,
        t: 40,
        b: 40
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      legend: {
        orientation: 'h',
        y: -0.1,
        x: 0.5,
        xanchor: 'center',
        font: {
          family: 'Arial, sans-serif',
          size: 12
        },
        bgcolor: 'rgba(255,255,255,0.7)',
        bordercolor: 'rgba(0,0,0,0.1)',
        borderwidth: 1
      }
    };
  }, [height, width]);

  // Use requestAnimationFrame for smoother updates
  const animationFrameRef = useRef(null);

  // Create and update the plot - optimized for smooth transitions
  useEffect(() => {
    if (!plotRef.current) return;

    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Schedule the update on the next animation frame for smoother rendering
    animationFrameRef.current = requestAnimationFrame(() => {

    // Generate smooth polygons for user and assistant emotions
    const userPolygon = generateSmoothPolygon(currentUserEmotions);
    const assistantPolygon = generateSmoothPolygon(currentAssistantEmotions);

    // Create traces array starting with the static sector traces
    const traces = [...sectorTraces];

    // Add user emotion polygon
    traces.push({
      type: 'scatterpolar',
      r: userPolygon.r,
      theta: userPolygon.theta,
      fill: 'toself',
      fillcolor: 'rgba(41,128,185,0.3)',
      line: {
        color: 'rgba(41,128,185,0.9)',
        width: 2.5,
        shape: 'spline'
      },
      name: "User Emotions",
      hoverinfo: 'name'
    });

    // Add assistant emotion polygon
    traces.push({
      type: 'scatterpolar',
      r: assistantPolygon.r,
      theta: assistantPolygon.theta,
      fill: 'toself',
      fillcolor: 'rgba(230,126,34,0.3)',
      line: {
        color: 'rgba(230,126,34,0.9)',
        width: 2.5,
        shape: 'spline'
      },
      name: "Assistant Emotions",
      hoverinfo: 'name'
    });

    // Add markers only for significant emotions (threshold increased)
    for (let i = 0; i < CORE_EMOTIONS.length; i++) {
      const emotion = CORE_EMOTIONS[i];
      const angle = i * 45;

      // User peak - only show for significant emotions
      const userScore = currentUserEmotions[emotion];
      if (userScore > 1.5) {  // Increased threshold from 1.0 to 1.5
        traces.push({
          type: 'scatterpolar',
          r: [userScore],
          theta: [angle],
          mode: 'markers',  // Removed text to improve performance
          marker: {
            size: 8,
            color: 'rgba(41,128,185,1)',
            symbol: 'circle',
            line: {
              color: 'white',
              width: 1
            }
          },
          showlegend: false,
          hoverinfo: 'text',
          hovertext: `User: ${emotion} (${userScore.toFixed(1)})`,
          name: `User ${emotion}`
        });
      }

      // Assistant peak - only show for significant emotions
      const assistantScore = currentAssistantEmotions[emotion];
      if (assistantScore > 1.5) {  // Increased threshold from 1.0 to 1.5
        traces.push({
          type: 'scatterpolar',
          r: [assistantScore],
          theta: [angle],
          mode: 'markers',  // Removed text to improve performance
          marker: {
            size: 8,
            color: 'rgba(230,126,34,1)',
            symbol: 'circle',
            line: {
              color: 'white',
              width: 1
            }
          },
          showlegend: false,
          hoverinfo: 'text',
          hovertext: `Assistant: ${emotion} (${assistantScore.toFixed(1)})`,
          name: `Assistant ${emotion}`
        });
      }
    }

    // Create or update the plot with optimized config
    if (!plotlyInitializedRef.current) {
      // Initial plot creation
      Plotly.newPlot(plotRef.current, traces, plotLayout, {
        displayModeBar: false,
        responsive: true,
        staticPlot: false  // Keep interactivity for better user experience
      });
      plotlyInitializedRef.current = true;
    } else {
      // Use a more reliable update method that won't cause flickering
      // Plotly.react is more reliable than Plotly.animate for this use case
      Plotly.react(plotRef.current, traces, plotLayout, {
        displayModeBar: false,
        responsive: true,
        staticPlot: false
      });
    }
    });

    // Cleanup function to cancel animation frame when component unmounts
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentUserEmotions, currentAssistantEmotions, sectorTraces, plotLayout]);

  return (
    <div className="emotion-wheel-container" style={{ width: '100%', height: '100%' }}>
      <div ref={plotRef} className="emotion-wheel-plot" style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
};

export default EmotionWheel;
