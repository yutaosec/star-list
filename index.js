const axios = require("axios");
const core = require("@actions/core");

const GITHUB_PERSON_ACCESS_TOKEN = core.getInput("pat");
const USER = core.getInput("user");
const EMAIL = core.getInput("email");
const REPO = core.getInput("repo");
const FILE_NAME = core.getInput("file");

const FILE_PATH = `https://api.github.com/repos/${USER}/${REPO}/contents/${FILE_NAME}`;

const getFullList = async (page, data) => {
  const list = data || [];
  const p = page || 1;

  const { data: result } = await axios.get(
    `https://api.github.com/users/Cygra/starred?per_page=100&page=${p}`
  );

  console.log(p + " done");

  list.push(...result);

  if (result.length < 100) {
    return list;
  }
  return await getFullList(p + 1, list);
};

const threeLargest = (list) => {
  let first, second, third;
  third = first = second = { stargazers_count: 0 };
  list.forEach((it) => {
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
  });
  return [first, second, third];
};

const threeSmallest = (list) => {
  let first, second, third;
  third = first = second = { stargazers_count: Number.MAX_SAFE_INTEGER };
  list.forEach((it) => {
    if (it.stargazers_count < first.stargazers_count) {
      third = second;
      second = first;
      first = it;
    } else if (it.stargazers_count < second.stargazers_count) {
      third = second;
      second = it;
    } else if (it.stargazers_count < third.stargazers_count) {
      third = it;
    }
  });
  return [first, second, third];
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

try {
  (async () => {
    const data = await getFullList(1);

    await axios.put(
      FILE_PATH,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
        sha: (await axios.get(FILE_PATH)).data.sha,
        message: "Update by script",
        committer: {
          name: USER,
          email: EMAIL,
        },
        content: Buffer.from(
          [
            `# All repos starred by ${USER}`,
            ``,
            `## Create your own star-list: `,
            `- fork this repo`,
            `- change \`user\` \`email\` \`repo\` \`file\` in .github/workflows/main.yml to your info`,
            `- Run workflow manually to flush the data`,
            ``,
            `## Repo with the most stars:`,
            ``,
            ...threeLargest(data).map(getDisplay),
            ``,
            `## Repo with the least stars:`,
            ``,
            ...threeSmallest(data).map(getDisplay),
            ``,
            `## The whole list: `,
            ``,
            ...data.map(getDisplay),
          ].join("\n")
        ).toString("base64"),
      },
      {
        auth: {
          username: USER,
          password: GITHUB_PERSON_ACCESS_TOKEN,
        },
      }
    );
  })();
} catch (error) {
  core.setFailed(error.message);
}
