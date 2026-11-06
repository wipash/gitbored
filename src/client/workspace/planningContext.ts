import { createContext } from 'react';
import type { PlanningSelection } from '../../shared/planning';

export const PlanningContext = createContext<PlanningSelection | undefined>(undefined);
