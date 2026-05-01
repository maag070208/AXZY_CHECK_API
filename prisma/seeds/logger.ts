
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  
  fgBlack: "\x1b[30m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
  fgWhite: "\x1b[37m",
  
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

export const hackerLog = {
  header: (text: string) => {
    console.log(`\n${colors.fgCyan}${colors.bright}>>> [ ${text.toUpperCase()} ]${colors.reset}`);
  },
  info: (module: string, text: string) => {
    console.log(`${colors.fgBlue}[ ${module.padEnd(10)} ]${colors.reset} ${text}...`);
  },
  success: (module: string, text: string) => {
    console.log(`${colors.fgGreen}[ ${module.padEnd(10)} ]${colors.reset} ${colors.fgGreen}✔ ${text}${colors.reset}`);
  },
  error: (module: string, text: string) => {
    console.log(`${colors.fgRed}[ ${module.padEnd(10)} ]${colors.reset} ${colors.fgRed}✘ ${text}${colors.reset}`);
  },
  divider: () => {
    console.log(`${colors.dim}------------------------------------------------------------${colors.reset}`);
  },
  ascii: () => {
    console.log(`${colors.fgGreen}${colors.bright}
    █████╗ ██╗  ██╗███████╗██╗   ██╗
    ██╔══██╗╚██╗██╔╝╚══███╔╝╚██╗ ██╔╝
    ███████║ ╚███╔╝   ███╔╝  ╚████╔╝ 
    ██╔══██║ ██╔██╗  ███╔╝    ╚██╔╝  
    ██║  ██║██╔╝ ██╗███████╗   ██║   
    ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   
    ${colors.reset}${colors.fgCyan}>>> DATABASE INITIALIZATION SEQUENCE...${colors.reset}\n`);
  }
};
