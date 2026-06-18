/*  MidPoint.s - 2nd order Runge-Kutte method  */
/*  uses 2 evaluations per step  */

/*  define:
           N = order of the system
           X, Y[i] = initial conditions
           Step = step size in X
           F[i]() = dY[i]/dx, i=1,N 
             no args, but involve X, Y[i]
           Err_tol = set for variable steps

   returns:   X, Y[i] at next step             */

exit "call as subroutine <step> only"

/*  advance one step  */

step:
  init_var Err_tol

  #---save starting values---
  X0 = X
  for_i = 1 N
    Y0[i] = Y[i]
  end_i

  #---step for emergency step size reset---
  for_i = 1 10

    #---1/2 step delta y---
    for_j = 1 N
      K1$[j] = (Step/2)*F[j]()
    end_j
    #---advance 1/2 step---
    X = X+Step/2
    for_j = 1 N
      Y[j] = Y[j]+K1$[j]
    end_j
    #--overall delta y---
    Err$ = 0
    for_j = 1 N
      K2$[j] = Step*F[j]()
      Err$ = Err$+sq(K2$[j]/2-K1$[j])
    end_j
    #---advance centered full step---
    X = X+Step/2
    for_j = 1 N
      Y[j] = Y[j]-K1$[j]+K2$[j]
    end_j

    #---error control if desired---
    if Err_tol
      Err$ = sqrt(Err$)*Step/2
      #---emergency reset to previous step---
      if Err$>10*Err_tol
        show_line "Midpoint step reset " @i
        if i>10;  exit "Midpoint setup error"; end_if
        Step = Step/10
        X = X0
        for_j = 1 N
          Y[j] = Y0[j]
        end_j
        continue    // redo step in place
      end_if
      #---normal step adjust---
      if Err$>Err_tol; Step = Step*0.9
      else_if Err$<Err_tol/2; Step = Step*1.1
      end_if
    end_if
    return
  end_i

return
  
  