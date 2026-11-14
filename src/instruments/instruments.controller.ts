import type { RequestHandler } from 'express';
import { getValidated } from '../shared/http/validate';
import { SearchQuery } from './instruments.schemas';
import type { InstrumentsService } from './instruments.service';

export const searchSchemas = { query: SearchQuery };

export class InstrumentsController {
  constructor(private readonly service: InstrumentsService) {}

  search: RequestHandler = async (req, res) => {
    const { query } = getValidated(req, searchSchemas);
    res.json(await this.service.search(query));
  };
}
