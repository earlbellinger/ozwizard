/*---------OZ test case--------*/
/* convective test case as in papers     */
/* for inner luminosity see Overtone-87  */

N = 4         // equations
M = 1000      // steps
X = 0         // t0
Y[1] = 1.4    // X0
Y[2] = 0      // V0
Y[3] = 0.9      // H0
Y[4] = 0.7      // Uc0
Err_tol = 0.00001   // optional
Xlast = 10
Step = 0.1*(Xlast-X)/M   // initial step

#---OZ parameters---
Zeta = 1              // 1/thermal timescale
Mgeo = 10             // m
Eta3 = 1-3/Mgeo       // eta^3
Eta = cbrt(Eta3)
G1 = 1.1              // Gamma1
G11 = G1-1
Nk = 1                // n
Sk = 3                // s
B1 = (Sk+4)*G11
B = 4+Mgeo*(Nk-B1)
Q = Mgeo*G1-2         // q
U = -1                // interior lum exp
Cq = 1                // turbulent dissipation

#---conv parameters---
Dc = Mgeo*G11/2
Cc = Mgeo-2
Zetac = 1         // 1/conv timescale
Gammac = 0.5      // conv fraction
Gammar = 1-Gammac

#---setup summary---
show Zeta Mgeo Eta Cq
show G1 Nk Sk B Q U
show Dc Cc Zetac Gammac

function Mvar() = 3/(1-(Eta/Y[1])^3)
function Bvar() = 4+Mvar()*(Nk-B1)
function Qvar() = Mvar()*G1-2

function Lum()= Y[1]^Bvar()*Y[3]^(Sk+4)

function Cvar() = Mvar()-2
function Dvar() = Mvar()*G11/2

function Lumc() = Y[1]^(-Cvar())*Y[4]^3

#---derivatives - fn(x,y[i])---
function F[1]() = Y[2]
function F[2]() = Y[3]/Y[1]^Qvar()-1/Y[1]^2-Cq*Y[2]^3
function F[3]() = Zeta*Y[1]^(Mvar()*G11)*(Y[1]^U-Gammar*Lum()-Gammac*Lumc())
function F[4]() = Zetac*(Y[1]^(-Dvar())*sqrt(Y[2])-Y[4])

#---optional i/o---
write_lab OZc.csv T X V H L Lr Lc Uc
write_dat X Y[1] Y[2] Y[3] 1 1 0 Y[4]
//show 0 X Y[1] Y[2] Y[3] Y[4]

#---integration here---
for_i = 1 M
  if ~(i%100) show i
  call step: midpoint.s
  write_dat X Y[1] Y[2] Y[3] Gammar*Lum()+Gammac*Lumc() Lum() Lumc() Y[4]
  if Y[1]>5|Lum()>10 break
  //show i X Y[1] Y[2] Y[3] Y[4]
end_i

close_file OZc.csv

system ozc.thor


  