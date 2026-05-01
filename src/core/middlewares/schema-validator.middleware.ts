import * as OpenApiValidator from 'express-openapi-validator';

const apiSpec = 'swagger.yaml';

export const apiValidator = () => {
  return OpenApiValidator.middleware({
    apiSpec,
    validateRequests: true,
    validateResponses: false,
  });
};
