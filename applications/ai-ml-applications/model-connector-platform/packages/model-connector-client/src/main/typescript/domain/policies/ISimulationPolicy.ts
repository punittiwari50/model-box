/**
 * Interface for Simulation Fallback Policy.
 * Conforms to:
 * - STD-COD-005: OOP Patterns & Strategy/Policy Pattern
 * - STD-COD-007: Resilient Error Handling
 */
export interface ISimulationPolicy {
  isSimulationAllowed(): boolean;
}
