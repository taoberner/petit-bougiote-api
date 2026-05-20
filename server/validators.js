const Joi = require('joi');

const createOrder = Joi.object({
  customer: Joi.string().max(100).required(),
  phone: Joi.string().regex(/^\+?[0-9\s\-\.]{9,20}$/).required().messages({ 'string.pattern.base': 'Téléphone invalide' }),
  address: Joi.string().max(500).required(),
  items: Joi.array().items(Joi.object({
    id: Joi.string(),
    name: Joi.string().max(100).required(),
    price: Joi.number().integer().min(0).max(100000).required(),
    qty: Joi.number().integer().min(1).max(100).required(),
  })).min(1).required(),
  note: Joi.string().max(500).allow('').optional(),
  student: Joi.boolean().optional(),
});

module.exports = { createOrder };
