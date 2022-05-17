const axios = require("axios");
const core = require("@actions/core");
const fs = require("fs");

const DEV = process.env.ENV === "dev";
const USER = core.getInput("user") || process.env.GH_USER;
const TOPIC_SVG_PATH = "topTopics.svg";

const getFullList = async (page, data) => {
  const list = data || [];
  const p = page || 1;

  const { data: result } = await axios.get(
    `https://api.github.com/users/${USER}/starred?per_page=100&page=${p}`
  );

  console.log(p + " done");

  list.push(...result);

  if (result.length < 100) {
    return list;
  }
  return await getFullList(p + 1, list);
};

const forEachInList = (list) => {
  let first,
    second,
    third,
    firstMin,
    secondMin,
    thirdMin,
    topicMap = {};

  third = first = second = { stargazers_count: 0 };
  thirdMin =
    firstMin =
    secondMin =
      { stargazers_count: Number.MAX_SAFE_INTEGER };

  list.forEach((it) => {
    // topics
    it.topics.forEach((topic) => {
      if (topicMap[topic]) {
        topicMap[topic]++;
      } else {
        topicMap[topic] = 1;
      }
    });

    // largest stars
    if (it.stargazers_count > first.stargazers_count) {
      third = second;
      second = first;
      first = it;
    } else if (it.stargazers_count > second.stargazers_count) {
      third = second;
      second = it;
    } else if (it.stargazers_count > third.stargazers_count) {
      third = it;
    }

    // smallest stars
    if (it.stargazers_count < firstMin.stargazers_count) {
      thirdMin = secondMin;
      secondMin = firstMin;
      firstMin = it;
    } else if (it.stargazers_count < secondMin.stargazers_count) {
      thirdMin = secondMin;
      secondMin = it;
    } else if (it.stargazers_count < thirdMin.stargazers_count) {
      thirdMin = it;
    }
  });
  return [
    [first, second, third],
    [firstMin, secondMin, thirdMin],
    Object.entries(topicMap).sort(([, a], [, b]) => b - a),
  ];
};

const getDisplay = ({
  full_name,
  html_url,
  description,
  stargazers_count,
  topics,
}) => {
  const result = [
    `- [${full_name}](${html_url})`,
    `  - \u2B50: ${stargazers_count.toLocaleString()}`,
    `  - \uD83D\uDCD6: ${description}`,
  ];
  if (topics.length) {
    result.push(
      `  - \uD83D\uDCA1: ${topics.map((it) => `\`${it}\``).join(" ")}`
    );
  }

  return result.join("\n") + "\n";
};

const colors = [
  "#73d13d",
  "#ffc53d",
  "#ffec3d",
  "#bae637",
  "#ff4d4f",
  "#ff7a45",
  "#9254de",
  "#ffa940",
  "#36cfc9",
  "#40a9ff",
  "#f759ab",
  "#597ef7",
];

const generateAndWriteSvg = (topTopics) => {
  let bar = "",
    topics = "";
  const total = topTopics.reduce((acc, cur) => acc + cur[1], 0);
  topTopics.forEach(([topic, count], i) => {
    const color = colors[i % 12];
    const percent = ((count * 100) / total).toFixed(2);

    bar += `<span style="background-color: ${color}; width: ${percent}%;" class="progress-item"></span>`;
    topics += `
<li>
  <svg xmlns="http://www.w3.org/2000/svg" class="octicon" style="fill: ${color};" viewBox="0 0 16 16" version="1.1" width="16" height="16">
    <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8z"></path>
  </svg>
  <span class="topic">${topic}</span>
  <span class="count">${count}</span>
</li>`;
  });
  return new Promise((resolve) => {
    fs.readFile("./templates/topics.svg", (err, data) => {
      if (err) throw err;
      const template = data.toString();
      resolve(
        template.replace("{{ bar }}", bar).replace("{{ topics }}", topics)
      );
    });
  });
};

const updateFile = async (path, content) => {
  return await axios.put(
    path,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
      sha: (await axios.get(path)).data.sha,
      message: "Update by script",
      committer: {
        name: USER,
        email: core.getInput("email"),
      },
      content: Buffer.from(content).toString("base64"),
    },
    {
      auth: {
        username: USER,
        password: core.getInput("pat"),
      },
    }
  );
};

try {
  (async () => {
    const data = await getFullList(1);
    const [largests, smallests, topTopics] = forEachInList(data);

    const content = [
      `# All repos starred by ${USER}`,
      ``,
      `## Create your own star-list: `,
      `- fork this repo`,
      `- generate a [Github Personal Access Token](https://github.com/settings/tokens) with \`repo\` scope, config it as \`pat\` in settings - secrets - actions`,
      `- change \`user\` \`email\` \`repo\` \`file\` in .github/workflows/main.yml to your info`,
      `- Run workflow manually to flush the data`,
      ``,
      `## Contents:`,
      `- [Repo with the most stars](#repo-with-the-most-stars)`,
      `- [Repo with the least stars](#repo-with-the-least-stars)`,
      `- [Top 20 topics](#top-20-topics)`,
      `- [The whole list](#the-whole-list)`,
      ``,
      `## Repo with the most stars:`,
      ``,
      ...largests.map(getDisplay),
      ``,
      `## Repo with the least stars:`,
      ``,
      ...smallests.map(getDisplay),
      ``,
      `## Top 20 topics:`,
      ``,
      `![](./${TOPIC_SVG_PATH})`,
      ``,
      `## The whole list: `,
      ``,
      ...data.map(getDisplay),
    ].join("\n");

    const topicsSvgContent = await generateAndWriteSvg(topTopics.slice(0, 20));

    if (DEV) {
      fs.writeFile("./README.md", content, () => {
        fs.writeFile(`./${TOPIC_SVG_PATH}`, topicsSvgContent, (err) => {
          if (err) throw err;
          console.log("Content wrote in README");
        });
      });
    } else {
      const REPO = core.getInput("repo");
      await updateFile(
        `https://api.github.com/repos/${USER}/${REPO}/contents/${TOPIC_SVG_PATH}`,
        topicsSvgContent
      );
      const FILE_NAME = core.getInput("file");
      await updateFile(
        `https://api.github.com/repos/${USER}/${REPO}/contents/${FILE_NAME}`,
        content
      );
    }
  })();
} catch (error) {
  core.setFailed(error.message);
}
