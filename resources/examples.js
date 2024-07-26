
let examples = Object.create(null);
examples["Binary Increment (Legacy Syntax)"] = `
1,0 1,0,>
1,1 1,1,>
1,_ 2,_,<

2,0 H,1,_
2,_ H,1,_
2,1 2,0,<
`.slice(1);

examples["Binary Increment (Advanced Syntax)"] = `
@ADVANCED
@INIT 1
@BLANK _
@HALT H

1,0 -> 1,0,>
1,1 -> 1,1,>
1,_ -> 2,_,<

2,0 -> H,1,_
2,_ -> H,1,_
2,1 -> 2,0,<

# input for testing
#T1+0!1101111
`.slice(1);

examples["4-State Busy Beaver (Legacy Syntax)"] = `
1,_ 2,1,>
1,1 2,1,<

2,_ 1,1,<
2,1 3,_,<

3,_ H,1,>
3,1 4,1,<

4,_ 4,1,>
4,1 1,_,>
`.slice(1);

examples["4-State Busy Beaver (Advanced Syntax)"] = `
@ADVANCED
@INIT 1
@BLANK _
@HALT H

1,_ -> 2,1,>
1,1 -> 2,1,<

2,_ -> 1,1,<
2,1 -> 3,_,<

3,_ -> H,1,>
3,1 -> 4,1,<

4,_ -> 4,1,>
4,1 -> 1,_,>
`.slice(1);

examples["Accept Even Unary Number (Advanced Syntax)"] = `
@ADVANCED
@INIT E
@ACCEPT E
@BLANK _

# halting also occurs when no valid
# transition can be found

E,1 -> O,1,>
O,1 -> E,1,>
`.slice(1);

examples["Accept Palindromes (Advanced Syntax)"] = `
@ADVANCED
@INIT 1
@BLANK _
@HALT H
@HALT A
@ACCEPT A

1,a -> 2,_,>
1,b -> 5,_,>

2,a -> 2,a,>
2,b -> 2,b,>
2,_ -> 3,_,<
3,a -> 4,_,<
3,b -> H,b,_
3,_ -> A,_,_

4,a -> 4,a,<
4,b -> 4,b,<
4,_ -> 1,_,>
1,_ -> A,_,_

5,a -> 5,a,>
5,b -> 5,b,>
5,_ -> 6,_,<
6,b -> 4,_,<
6,a -> H,a,_
6,_ -> A,_,_
`.slice(1);

examples["Multi-Tape Binary Add (Advanced Syntax)"] = `
@ADVANCED
@TAPES 3
@INIT I
@BLANK _
@HALT H

I,0,0,_ -> I,0,0,_, >
I,0,1,_ -> I,0,1,_, >
I,1,0,_ -> I,1,0,_, >
I,1,1,_ -> I,1,1,_, >

I,0,_,_ -> I,0,_,_, >,_,>
I,1,_,_ -> I,1,_,_, >,_,>
I,_,0,_ -> I,_,0,_, _,>,>
I,_,1,_ -> I,_,1,_, _,>,>

I,_,_,_ -> N,_,_,_, <

N,0,0,_ -> N,0,0,0, <
N,0,1,_ -> N,0,1,1, <
N,1,0,_ -> N,1,0,1, <
N,1,1,_ -> C,1,1,0, <

N,0,_,_ -> N,0,_,0, <
N,1,_,_ -> N,1,_,1, <
N,_,0,_ -> N,_,0,0, <
N,_,1,_ -> N,_,1,1, <

N,_,_,_ -> H,_,_,_, _

C,0,0,_ -> N,0,0,1, <
C,0,1,_ -> C,0,1,0, <
C,1,0,_ -> C,1,0,0, <
C,1,1,_ -> C,1,1,1, <

C,0,_,_ -> N,0,_,1, <
C,1,_,_ -> C,1,_,0, <
C,_,0,_ -> N,_,0,1, <
C,_,1,_ -> C,_,1,0, <

C,_,_,_ -> H,_,_,1, _
`.slice(1);

examples["Features Demo (Advanced Syntax)"] = `
@ADVANCED
@INIT #
@BLANK _
@COMMA ;
@ARROW =>
@HALT \uD83D\uDC68\u200D\uD83C\uDF93
@ACCEPT \uD83D\uDC68\u200D\uD83C\uDF93

# you can still use @ and # as states
# by using a space as the first character
 #;_ => @;1;>
 @;_ => ,;2;>

# remap "," and "->" to use as states
,;_  => ->;3;>

# you can also use multi-symbol unicode symbols
->;_ => \uD83D\uDC68\u200D\uD83C\uDF93;4;>
`.slice(1);
