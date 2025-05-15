const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.endsWith(".route.js") && file !== "index.js"
    );
  })
  .forEach((file) => {
    const route = require(path.join(__dirname, file));

    const routeName = "/" + file.replace(".route.js", "");
    router.use(routeName, route);
  });

module.exports = router;
