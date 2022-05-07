const Koa = require("koa");
const axios = require("axios");

const app = new Koa();

const getFullList = async (page, data) => {
  const list = data || [];
  const p = page || 1;
  const { data: result } = await axios.get(
    `https://api.github.com/users/Cygra/starred?per_page=100&page=${p}`
  );
  list.push(
    ...result.map(
      ({ name, html_url, description, stargazers_count }) =>
        `|[${name}](${html_url})|${stargazers_count}|${description}|`
    )
  );

  if (result.length < 100) {
    return list;
  }
  return await getFullList(p + 1, list);
};

app.use(async (ctx) => {
  const data = await getFullList(1);
  ctx.body = ["|name|stars|description|", "|---|---|---|"]
    .concat(data)
    .join("\n");
});

app.listen(3000);
