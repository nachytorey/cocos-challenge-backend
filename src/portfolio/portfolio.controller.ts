import type { RequestHandler } from 'express';
import { getValidated } from '../shared/http/validate';
import { PortfolioParams } from './portfolio.schemas';
import type { PortfolioService } from './portfolio.service';

export const portfolioSchemas = { params: PortfolioParams };

export class PortfolioController {
  constructor(private readonly service: PortfolioService) {}

  get: RequestHandler = async (req, res) => {
    const { params } = getValidated(req, portfolioSchemas);
    res.json(await this.service.getPortfolio(params.userId));
  };
}
