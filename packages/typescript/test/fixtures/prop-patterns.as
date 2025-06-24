export interface WithPatterns {
    prop1: string
    [*]: number
    [/^abc/i]: boolean
    nested: {
      [*]: number  
      [/^str/i]: string
    } & WithPatterns2
}

interface WithPatterns2 {
    [*]: boolean
}