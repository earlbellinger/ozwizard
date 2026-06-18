/*---------OZ test case--------*/
/* radiative test case as in papers      */
/* for inner luminosity see Overtone-87  */

N = 3
M = 1000
X = 0
Y[1] = 1.2   // X0
Y[2] = 0     // V0
Y[3] = .8     // H0
Err_tol = 0.00001   // optional
Xlast = 10
Step = 0.1*(Xlast-X)/M   // initial step

#---OZ parameters---
Zeta = 1
Mgeo = 10             // m
Eta3 = 1-3/Mgeo
Eta = cbrt(Eta3)
G1 = 1.1              // Gamma1
G11 = G1-1
Nk = 1                // n
Sk = 3                // s
B1 = (Sk+4)*G11
B = 4+Mgeo*(Nk-B1)
Q = Mgeo*G1-2         // q
U = -1                // interior lum ex (-1 for fundamental)
Cq = 2                // turbulent dissipation

show Zeta Mgeo Eta Cq
show G1 Nk Sk B Q U

function Mvar() = 3/(1-(Eta/Y[1])^3)
function Bvar() = 4+Mvar()*(Nk-B1)
function Lum()= Y[1]^Bvar()*Y[3]^(Sk+4)
function Qvar() = Mvar()*G1-2

#---derivatives - fn(x,y[i])---
function F[1]() = Y[2]
function F[2]() = Y[3]/Y[1]^Qvar()-1/Y[1]^2-Cq*Y[2]^3
function F[3]() = Zeta*Y[1]^(Mvar()*G11)*(Y[1]^U-Lum())

#---optional i/o---
write_lab OZ1.csv T X V H L
write_dat X Y[1] Y[2] Y[3] 1
//show 0 X Y[1] Y[2] Y[3]

#---integration here---
for_i = 1 M
  if ~(i%100) show i
  call step: midpoint.s
  write_dat X Y[1] Y[2] Y[3] Lum()
  if Y[1]>5 break
  //show i X Y[1] Y[2] Y[3]
end_i

close_file OZ1.csv

system oz1.thor


  