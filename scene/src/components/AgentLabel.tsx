import { Html } from '@react-three/drei';

interface AgentLabelProps {
  emoji: string;
  name: string;
  color: string;
  bubbleText: string | null;
  bubbleVisible: boolean;
  talkingGlow: number;
}

export function AgentLabel({ emoji, name, color, bubbleText, bubbleVisible, talkingGlow }: AgentLabelProps) {
  const glow = 0.35 + talkingGlow * 0.65;

  return (
    <group position={[0, 2.05, 0]}>
      <Html center distanceFactor={9} zIndexRange={[40, 0]}>
        <div
          className="office-agent-ui"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {bubbleVisible && bubbleText && (
            <div
              className="office-speech-bubble"
              style={{
                maxWidth: 200,
                padding: '8px 12px',
                borderRadius: 12,
                background: 'rgba(12, 18, 32, 0.88)',
                backdropFilter: 'blur(10px)',
                border: `2px solid ${color}`,
                boxShadow: `0 0 ${12 + talkingGlow * 20}px ${color}55`,
                color: '#e2e8f0',
                fontSize: 11,
                lineHeight: 1.35,
                transform: `scale(${0.95 + talkingGlow * 0.08})`,
                transition: 'transform 0.25s ease',
              }}
            >
              {bubbleText}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.82)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${color}`,
              boxShadow: `0 0 ${8 + glow * 16}px ${color}44`,
              color: '#e2e8f0',
              fontSize: 10,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span>{name}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}