// Synchronized with /mt5_bridge.py — MetaTrader 5 Only Market Data & Execution Bridge
import mt5BridgeSource from '../../mt5_bridge.py?raw';

export function buildMt5BridgePython(): string {
  return mt5BridgeSource;
}
