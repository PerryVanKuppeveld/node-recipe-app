const request = require('supertest');
const express = require('express');
const routes = require('../src/routes');
const { initializeTestDb } = require('./test-database');

// Mock the database module to use test database
jest.mock('../src/database', () => ({
  getDbConnection: () => require('./test-database').getTestDbConnection()
}));

// Simple app setup for testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Simple mock for res.render
  app.use((req, res, next) => {
    res.render = (view, locals) => res.json({ view, locals });
    next();
  });
  
  app.use('/', routes);
  return app;
}

describe('Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    app = createTestApp();
    db = await initializeTestDb();
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  test('GET / should return 200', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.view).toBe('home');
  });

  test('POST /recipes should create a new recipe', async () => {
    const newRecipe = {
      title: 'New Test Recipe',
      ingredients: 'New test ingredients',
      method: 'New test method'
    };

    const response = await request(app)
      .post('/recipes')
      .send(newRecipe);

    expect(response.status).toBe(302); // Redirect status
    expect(response.headers.location).toBe('/recipes');

    // Verify recipe was created
    const recipe = await db.get('SELECT * FROM recipes WHERE title = ?', [newRecipe.title]);
    expect(recipe).toBeDefined();
    expect(recipe.title).toBe(newRecipe.title);
  });

  test('POST /recipes/:id/delete should remove the recipe', async () => {
    const recipe = {
      title: 'Recipe to Delete',
      ingredients: 'Ingredient 1',
      method: 'Step 1'
    };

    await db.run('INSERT INTO recipes (title, ingredients, method) VALUES (?, ?, ?)', [recipe.title, recipe.ingredients, recipe.method]);
    const createdRecipe = await db.get('SELECT * FROM recipes WHERE title = ?', [recipe.title]);

    const response = await request(app)
      .post(`/recipes/${createdRecipe.id}/delete`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/recipes');

    const deletedRecipe = await db.get('SELECT * FROM recipes WHERE id = ?', [createdRecipe.id]);
    expect(deletedRecipe).toBeUndefined();
  });

  test('recipe template includes delete buttons in both the view and edit states', async () => {
    const recipeTemplate = require('fs').readFileSync(require('path').join(__dirname, '../views/recipe.hbs'), 'utf8');

    expect(recipeTemplate).toContain('action="/recipes/{{recipe.id}}/delete"');
    expect(recipeTemplate).toContain('Delete Recipe');
    expect((recipeTemplate.match(/action="\/recipes\/\{\{recipe\.id\}\}\/delete"/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});