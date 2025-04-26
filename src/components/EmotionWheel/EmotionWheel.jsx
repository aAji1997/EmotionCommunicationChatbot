import React, { useState, useEffect, useRef } from 'react';
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

// Helper function to convert hex to rgba
const hexToRgba = (hex, alpha = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Helper function to generate a smooth polygon for the emotion wheel
const generateSmoothPolygon = (emotionScores) => {
  // Number of points to generate for the smooth polygon - more points for smoother curve
  const numPoints = 48;

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

    // Use cubic interpolation for smoother transitions between emotions
    // This creates a more natural curve than linear interpolation
    const t = factor;
    const t2 = t * t;
    const t3 = t2 * t;
    const h1 = 2*t3 - 3*t2 + 1;  // Hermite basis function 1
    const h2 = -2*t3 + 3*t2;     // Hermite basis function 2
    const h3 = t3 - 2*t2 + t;    // Hermite basis function 3
    const h4 = t3 - t2;          // Hermite basis function 4

    // Use Hermite interpolation with zero tangents for a smoother curve
    const interpolatedScore = h1 * score1 + h2 * score2;

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

  return { r, theta };
};

const EmotionWheel = ({ emotions, height = 400, width = 400 }) => {
  const plotRef = useRef(null);
  const [currentUserEmotions, setCurrentUserEmotions] = useState({});
  const [currentAssistantEmotions, setCurrentAssistantEmotions] = useState({});
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const animationRef = useRef(null);
  const [forceUpdate, setForceUpdate] = useState(0); // Add a state variable to force updates

  // Force a re-render every 2 seconds to ensure the wheel updates
  useEffect(() => {
    const forceUpdateInterval = setInterval(() => {
      setForceUpdate(prev => prev + 1);
      console.log("Forcing EmotionWheel update:", forceUpdate + 1);
    }, 2000);

    return () => clearInterval(forceUpdateInterval);
  }, []);

  // Initialize with default emotions
  useEffect(() => {
    setCurrentUserEmotions(CORE_EMOTIONS.reduce((acc, emotion) => {
      acc[emotion] = 0;
      return acc;
    }, {}));

    setCurrentAssistantEmotions(CORE_EMOTIONS.reduce((acc, emotion) => {
      acc[emotion] = 0;
      return acc;
    }, {}));
  }, []);

  // We've removed the animation effect since it might be causing issues
  // The emotions are now directly updated in the effect above

  // Directly update the emotions when they change
  useEffect(() => {
    // Log the current emotions for debugging
    console.log("EmotionWheel received new emotions:", emotions);

    // Skip if emotions data is not valid
    if (!emotions || !emotions.user || !emotions.assistant) {
      console.log("EmotionWheel: Invalid emotions data");
      return;
    }

    // Log the specific emotion values for debugging
    console.log("User emotions:", Object.entries(emotions.user).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(', '));
    console.log("Assistant emotions:", Object.entries(emotions.assistant).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(', '));

    // Immediately set the target values without animation
    setCurrentUserEmotions({...emotions.user});
    setCurrentAssistantEmotions({...emotions.assistant});

    // Force a re-render by updating the last update time
    setLastUpdateTime(Date.now());
  }, [emotions]);

  // Create and update the plot
  useEffect(() => {
    if (!plotRef.current) return;

    // Log the current state for debugging
    console.log("Updating plot with:", {
      currentUserEmotions,
      currentAssistantEmotions,
      timestamp: new Date().toISOString()
    });

    // Create the base figure
    const createFigure = () => {
      // Use the latest emotion data directly from the emotions prop if available
      const userEmotions = emotions && emotions.user ? emotions.user : currentUserEmotions;
      const assistantEmotions = emotions && emotions.assistant ? emotions.assistant : currentAssistantEmotions;

      // Generate smooth polygons for user and assistant emotions
      const userPolygon = generateSmoothPolygon(userEmotions);
      const assistantPolygon = generateSmoothPolygon(assistantEmotions);

      // Create traces for the emotion wheel background
      const traces = [];

      // Add emotion sectors
      for (let i = 0; i < CORE_EMOTIONS.length; i++) {
        const emotion = CORE_EMOTIONS[i];
        const angle = i * 45;  // 360 / 8 = 45 degrees per emotion

        // Add sector labels with improved positioning
        // Custom positioning for problematic labels
        let labelR = 3.6;  // Default distance - reduced to fit in container
        let labelTheta = angle;
        let labelFont = {
          color: EMOTION_COLORS[emotion],
          size: 12,  // Smaller font size
          family: 'Arial, sans-serif'
        };

        // Adjust specific labels that might overlap
        if (emotion === 'Sadness') {
          labelR = 3.7;  // Push out a bit more
        } else if (emotion === 'Disgust') {
          labelR = 3.7;
        } else if (emotion === 'Fear') {
          labelR = 3.7;
        } else if (emotion === 'Surprise') {
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

        // Add colored sectors with improved styling
        const sectorTheta = [];
        const sectorR = [];

        // Create a more refined sector shape
        for (let j = 0; j < 30; j++) {  // More points for smoother curve
          sectorTheta.push(angle - 22.5 + j * 45 / 29);
          sectorR.push(2.8);  // Reduced radius for the outer edge to fit in container
        }

        traces.push({
          type: 'scatterpolar',
          r: sectorR,
          theta: sectorTheta,
          fill: 'toself',
          fillcolor: hexToRgba(EMOTION_COLORS[emotion], 0.07),  // More subtle background
          line: {
            color: hexToRgba(EMOTION_COLORS[emotion], 0.3),  // More subtle border
            width: 0.5,  // Thinner line
            dash: 'dot'  // Dotted line for a more elegant look
          },
          showlegend: false,
          hoverinfo: 'none'  // No hover info for cleaner interaction
        });
      }

      // Add user emotion polygon with improved styling
      traces.push({
        type: 'scatterpolar',
        r: userPolygon.r,
        theta: userPolygon.theta,
        fill: 'toself',
        fillcolor: 'rgba(41,128,185,0.3)',  // More professional blue
        line: {
          color: 'rgba(41,128,185,0.9)',
          width: 2.5,
          shape: 'spline'  // Smoother lines
        },
        name: "User Emotions",
        hoverinfo: 'name'  // Cleaner hover info
      });

      // Add assistant emotion polygon with improved styling
      traces.push({
        type: 'scatterpolar',
        r: assistantPolygon.r,
        theta: assistantPolygon.theta,
        fill: 'toself',
        fillcolor: 'rgba(230,126,34,0.3)',  // More professional orange
        line: {
          color: 'rgba(230,126,34,0.9)',
          width: 2.5,
          shape: 'spline'  // Smoother lines
        },
        name: "Assistant Emotions",
        hoverinfo: 'name'  // Cleaner hover info
      });

      // Add markers for the peak emotions with improved styling
      for (let i = 0; i < CORE_EMOTIONS.length; i++) {
        const emotion = CORE_EMOTIONS[i];
        const angle = i * 45;

        // User peak - only show for significant emotions (threshold increased)
        const userScore = currentUserEmotions[emotion];
        if (userScore > 1.0) {  // Only show stronger emotions
          traces.push({
            type: 'scatterpolar',
            r: [userScore],
            theta: [angle],
            mode: 'markers+text',
            text: [emotion],  // Show emotion name at peak
            textposition: 'middle center',
            textfont: {
              size: 10,
              color: 'rgba(41,128,185,1)'
            },
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
        if (assistantScore > 1.0) {  // Only show stronger emotions
          traces.push({
            type: 'scatterpolar',
            r: [assistantScore],
            theta: [angle],
            mode: 'markers+text',
            text: [emotion],  // Show emotion name at peak
            textposition: 'middle center',
            textfont: {
              size: 10,
              color: 'rgba(230,126,34,1)'
            },
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

      // Layout configuration
      const layout = {
        polar: {
          radialaxis: {
            visible: true,
            range: [0, 4.0],  // Adjusted range to fit in container better
            showticklabels: false,
            ticks: '',
            showline: false,  // Hide the radial axis line for cleaner look
            showgrid: false   // Hide the radial grid for cleaner look
          },
          angularaxis: {
            visible: true,
            tickmode: 'array',
            tickvals: Array.from({ length: 8 }, (_, i) => i * 45),
            ticktext: Array(8).fill(''),  // Remove default labels for cleaner look
            direction: 'clockwise',
            rotation: 22.5,  // Offset to align with emotion sectors
            showticklabels: false,  // Hide the angular axis labels
            showline: false,  // Hide the angular axis line
            showgrid: false   // Hide the angular grid for cleaner look
          },
          bgcolor: 'rgba(248, 248, 252, 0.5)'  // Lighter, more subtle background
        },
        showlegend: true,
        // Remove the title since we're adding it in the container
        title: {
          text: "",
          font: {
            family: 'Arial, sans-serif',
            size: 0,
            color: '#333'
          },
          y: 0.98  // Adjust title position
        },
        height: height,
        width: width,
        margin: {
          l: 30,  // Reduced left margin
          r: 30,  // Reduced right margin
          t: 40,  // Reduced top margin
          b: 40   // Reduced bottom margin
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        legend: {
          orientation: 'h',  // Horizontal legend
          y: -0.1,   // Position closer to the chart
          x: 0.5,    // Center horizontally
          xanchor: 'center',
          font: {
            family: 'Arial, sans-serif',
            size: 12
          },
          bgcolor: 'rgba(255,255,255,0.7)',  // Semi-transparent background
          bordercolor: 'rgba(0,0,0,0.1)',    // Light border
          borderwidth: 1
        }
      };

      return { data: traces, layout };
    };

    // Create the figure
    const figure = createFigure();

    // Create or update the plot
    Plotly.react(plotRef.current, figure.data, figure.layout, { displayModeBar: false });

    // Log successful update
    console.log("Plot updated successfully");

  }, [emotions, currentUserEmotions, currentAssistantEmotions, height, width, lastUpdateTime, forceUpdate]);

  return (
    <div className="emotion-wheel-container" style={{ width: '100%', height: '100%' }}>
      <div ref={plotRef} className="emotion-wheel-plot" style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
};

export default EmotionWheel;
