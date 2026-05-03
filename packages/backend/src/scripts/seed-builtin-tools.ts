import { seedBuiltinTools } from '../db/seed/builtin-tools.js';

seedBuiltinTools()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
